import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The whole Phase A data model (BRIEF.md §4 + docs/DECISIONS.md).
 * Conventions: uuid ids, money as bigint paise, percentages as integer basis points,
 * statuses as text + CHECK (easy to extend), timestamps as timestamptz, calendar days as date.
 * Phase B (AI) tables come in their own migration.
 */
export class InitialSchema1763400000000 implements MigrationInterface {
  name = 'InitialSchema1763400000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
      BEGIN NEW.updated_at = now(); RETURN NEW; END;
      $$ LANGUAGE plpgsql;
    `);

    // ---------- Users, sessions, settings ----------
    await q.query(`
      CREATE TABLE app_user (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text NOT NULL,
        password_hash text NOT NULL,
        name text NOT NULL DEFAULT '',
        role text NOT NULL DEFAULT 'OWNER' CHECK (role IN ('OWNER', 'STAFF')),
        token_version integer NOT NULL DEFAULT 0,
        setup_completed_at timestamptz,
        last_login_at timestamptz,
        disabled_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX app_user_email_key ON app_user (lower(email));

      CREATE TABLE refresh_token (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        family_id uuid NOT NULL,
        token_hash text NOT NULL UNIQUE,
        expires_at timestamptz NOT NULL,
        last_used_at timestamptz,
        revoked_at timestamptz,
        revoked_reason text,
        user_agent text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX refresh_token_user_idx ON refresh_token (user_id) WHERE revoked_at IS NULL;
      CREATE INDEX refresh_token_family_idx ON refresh_token (family_id);

      CREATE TABLE setting (
        key text PRIMARY KEY,
        value jsonb NOT NULL,
        confirmed boolean NOT NULL DEFAULT true,
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by uuid REFERENCES app_user(id)
      );

      CREATE TABLE airport (
        iata char(3) PRIMARY KEY,
        icao char(4),
        city text NOT NULL,
        name text NOT NULL,
        state_code char(2),
        country char(2) NOT NULL DEFAULT 'IN'
      );

      CREATE TABLE file (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        storage_key text NOT NULL UNIQUE,
        mime text NOT NULL,
        size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
        sha256 text NOT NULL,
        original_name text,
        encrypted boolean NOT NULL DEFAULT false,
        purge_at timestamptz,
        purged_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid REFERENCES app_user(id)
      );
      CREATE INDEX file_purge_idx ON file (purge_at) WHERE purged_at IS NULL AND purge_at IS NOT NULL;

      CREATE TABLE file_access_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        file_id uuid NOT NULL REFERENCES file(id) ON DELETE CASCADE,
        user_id uuid REFERENCES app_user(id),
        purpose text NOT NULL,
        at timestamptz NOT NULL DEFAULT now()
      );
    `);

    // ---------- Business profiles ----------
    await q.query(`
      CREATE TABLE business_profile (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        label text NOT NULL,
        brand_name text,
        legal_name text,
        llpin text,
        gstin text,
        state_code char(2) NOT NULL DEFAULT '07',
        registered_address text,
        bank_details_enc bytea,
        bank_hint text,
        signatory_name text,
        signatory_designation text,
        arbitration_seat_city text,
        logo_file_id uuid REFERENCES file(id),
        invoice_prefix text NOT NULL DEFAULT 'SJ' CHECK (invoice_prefix ~ '^[A-Z0-9-]{1,10}$'),
        is_default boolean NOT NULL DEFAULT false,
        archived_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid REFERENCES app_user(id),
        CHECK (NOT (is_default AND archived_at IS NOT NULL))
      );
      CREATE UNIQUE INDEX business_profile_one_default ON business_profile (is_default) WHERE is_default;

      CREATE TABLE invoice_sequence (
        business_profile_id uuid NOT NULL REFERENCES business_profile(id),
        fy text NOT NULL CHECK (fy ~ '^[0-9]{4}-[0-9]{2}$'),
        last_value integer NOT NULL DEFAULT 0,
        PRIMARY KEY (business_profile_id, fy)
      );
    `);

    // ---------- Partners and clients ----------
    await q.query(`
      CREATE TABLE partner (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        type text NOT NULL CHECK (type IN ('PLANNER', 'HOTEL', 'OTHER')),
        firm text NOT NULL,
        city text,
        contact_person text,
        phone text,
        email text,
        website text,
        instagram text,
        source_link text,
        fit_note text,
        status text NOT NULL DEFAULT 'IMPORTED'
          CHECK (status IN ('IMPORTED', 'CONTACTED', 'CALL_DONE', 'ACTIVE', 'INACTIVE')),
        commission_basis text NOT NULL DEFAULT 'MARGIN_SHARE'
          CHECK (commission_basis IN ('MARGIN_SHARE', 'BOOKING_PERCENT')),
        commission_bps integer NOT NULL DEFAULT 2000 CHECK (commission_bps BETWEEN 0 AND 10000),
        referral_signed boolean NOT NULL DEFAULT false,
        referral_document_id uuid,
        next_follow_up_on date,
        notes text,
        deleted_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid REFERENCES app_user(id)
      );
      CREATE INDEX partner_status_idx ON partner (status) WHERE deleted_at IS NULL;
      CREATE INDEX partner_follow_up_idx ON partner (next_follow_up_on) WHERE deleted_at IS NULL;
      CREATE INDEX partner_phone_idx ON partner (phone);
      CREATE INDEX partner_email_idx ON partner (lower(email));

      CREATE TABLE partner_activity (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        partner_id uuid NOT NULL REFERENCES partner(id) ON DELETE CASCADE,
        kind text NOT NULL CHECK (kind IN ('CALLED', 'NO_ANSWER', 'SENT_DECK', 'CALL_BOOKED', 'MET', 'NOTE')),
        note text,
        at timestamptz NOT NULL DEFAULT now(),
        created_by uuid REFERENCES app_user(id)
      );
      CREATE INDEX partner_activity_partner_idx ON partner_activity (partner_id, at DESC);

      CREATE TABLE client (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        type text NOT NULL DEFAULT 'FAMILY' CHECK (type IN ('FAMILY', 'CORPORATE')),
        name text NOT NULL,
        phone text,
        email text,
        gstin text,
        partner_id uuid REFERENCES partner(id),
        notes text,
        deleted_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid REFERENCES app_user(id)
      );

      CREATE TABLE consent (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        subject_type text NOT NULL CHECK (subject_type IN ('PARTNER', 'CLIENT', 'ENQUIRY', 'GUEST')),
        subject_id uuid NOT NULL,
        notice_version text NOT NULL,
        given_at timestamptz NOT NULL,
        source text NOT NULL,
        withdrawn_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX consent_subject_idx ON consent (subject_type, subject_id);
    `);

    // ---------- Operators ----------
    await q.query(`
      CREATE TABLE operator (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        legal_name text NOT NULL,
        brand text,
        cin text,
        gstin text,
        nsop_no text,
        nsop_issued_on date,
        nsop_expires_on date,
        insurance_expires_on date,
        website text,
        safety_disclosure_url text,
        source_link text,
        dgca_rank integer,
        dgca_rank_checked_on date,
        dgca_rank_source text,
        bank_details_enc bytea,
        bank_hint text,
        cancellation_terms text,
        status text NOT NULL DEFAULT 'FOUND' CHECK (status IN ('FOUND', 'VERIFIED', 'EXPIRING_SOON', 'BLOCKED')),
        blocked_reason text,
        notes text,
        deleted_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid REFERENCES app_user(id)
      );
      CREATE UNIQUE INDEX operator_nsop_key ON operator (upper(nsop_no)) WHERE nsop_no IS NOT NULL AND deleted_at IS NULL;
      CREATE UNIQUE INDEX operator_cin_key ON operator (upper(cin)) WHERE cin IS NOT NULL AND deleted_at IS NULL;
      CREATE INDEX operator_status_idx ON operator (status) WHERE deleted_at IS NULL;

      CREATE TABLE operator_base (
        operator_id uuid NOT NULL REFERENCES operator(id) ON DELETE CASCADE,
        airport_iata char(3) NOT NULL REFERENCES airport(iata),
        PRIMARY KEY (operator_id, airport_iata)
      );

      CREATE TABLE operator_contact (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        operator_id uuid NOT NULL REFERENCES operator(id) ON DELETE CASCADE,
        name text NOT NULL,
        role text,
        phone text,
        email text,
        is_primary boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE aircraft (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        operator_id uuid NOT NULL REFERENCES operator(id) ON DELETE CASCADE,
        type text NOT NULL,
        registration text,
        category text NOT NULL CHECK (category IN ('TURBOPROP', 'LIGHT', 'MIDSIZE', 'SUPER_MIDSIZE', 'HEAVY')),
        seats integer NOT NULL CHECK (seats > 0),
        year integer CHECK (year BETWEEN 1950 AND 2100),
        base_airport char(3) REFERENCES airport(iata),
        deleted_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX aircraft_registration_key ON aircraft (upper(registration)) WHERE registration IS NOT NULL AND deleted_at IS NULL;
      CREATE INDEX aircraft_operator_idx ON aircraft (operator_id);

      CREATE TABLE operator_document (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        operator_id uuid NOT NULL REFERENCES operator(id) ON DELETE CASCADE,
        kind text NOT NULL CHECK (kind IN ('NSOP', 'INSURANCE', 'OPERATOR_AGREEMENT')),
        file_id uuid REFERENCES file(id),
        expires_on date,
        verified_on date,
        verified_by uuid REFERENCES app_user(id),
        notes text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX operator_document_operator_idx ON operator_document (operator_id, kind);
    `);

    // ---------- Weddings, legs, guests ----------
    await q.query(`
      CREATE SEQUENCE wedding_number_seq START 101;

      CREATE TABLE wedding (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        number integer NOT NULL UNIQUE DEFAULT nextval('wedding_number_seq'),
        code text GENERATED ALWAYS AS ('W-' || number::text) STORED,
        business_profile_id uuid REFERENCES business_profile(id),
        partner_id uuid REFERENCES partner(id),
        client_id uuid REFERENCES client(id),
        venue_city text,
        starts_on date,
        ends_on date,
        lead_source text NOT NULL DEFAULT 'OTHER'
          CHECK (lead_source IN ('PARTNER', 'NETWORK', 'HOTEL', 'WEBSITE', 'GOOGLE_ADS', 'INSTAGRAM', 'OTHER')),
        utm_source text,
        utm_medium text,
        utm_campaign text,
        utm_term text,
        utm_content text,
        landing_page text,
        status text NOT NULL DEFAULT 'ENQUIRY'
          CHECK (status IN ('ENQUIRY', 'RATES_REQUESTED', 'QUOTED', 'SIGNED_AND_PAID', 'FLYING', 'DONE', 'LOST')),
        lost_reason text,
        required_payment_bps integer NOT NULL DEFAULT 10000 CHECK (required_payment_bps BETWEEN 0 AND 10000),
        payment_plan_bps integer[] NOT NULL DEFAULT '{10000}',
        place_of_supply_state char(2),
        notes text,
        deleted_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid REFERENCES app_user(id),
        CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on),
        CHECK (status <> 'LOST' OR lost_reason IS NOT NULL)
      );
      CREATE UNIQUE INDEX wedding_code_key ON wedding (code);
      CREATE INDEX wedding_status_idx ON wedding (status) WHERE deleted_at IS NULL;
      CREATE INDEX wedding_partner_idx ON wedding (partner_id);
      ALTER SEQUENCE wedding_number_seq OWNED BY wedding.number;

      CREATE TABLE enquiry (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        source text NOT NULL CHECK (source IN ('WEBSITE', 'PASTE')),
        raw_text text,
        payload jsonb NOT NULL DEFAULT '{}',
        honeypot_hit boolean NOT NULL DEFAULT false,
        ip_hash text,
        wedding_id uuid REFERENCES wedding(id),
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE leg (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        wedding_id uuid NOT NULL REFERENCES wedding(id) ON DELETE CASCADE,
        seq integer NOT NULL,
        from_iata char(3) NOT NULL REFERENCES airport(iata),
        to_iata char(3) NOT NULL REFERENCES airport(iata),
        flight_date date NOT NULL,
        window_from time,
        window_to time,
        pax integer NOT NULL CHECK (pax > 0),
        category text CHECK (category IN ('TURBOPROP', 'LIGHT', 'MIDSIZE', 'SUPER_MIDSIZE', 'HEAVY')),
        status text NOT NULL DEFAULT 'OPEN'
          CHECK (status IN ('OPEN', 'RATES_REQUESTED', 'RATES_IN', 'CHOSEN', 'QUOTED', 'CONFIRMED', 'FLOWN', 'CANCELLED')),
        notes text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (wedding_id, seq),
        CHECK (from_iata <> to_iata)
      );
      CREATE INDEX leg_date_idx ON leg (flight_date);

      CREATE TABLE guest (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        leg_id uuid NOT NULL REFERENCES leg(id) ON DELETE CASCADE,
        name text NOT NULL,
        phone text,
        id_received boolean NOT NULL DEFAULT false,
        id_file_id uuid REFERENCES file(id),
        id_purge_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX guest_leg_idx ON guest (leg_id);
    `);

    // ---------- Rates ----------
    await q.query(`
      CREATE TABLE rate_request (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        wedding_id uuid NOT NULL REFERENCES wedding(id) ON DELETE CASCADE,
        operator_id uuid NOT NULL REFERENCES operator(id),
        channel text NOT NULL CHECK (channel IN ('WHATSAPP', 'EMAIL', 'PHONE', 'OTHER')),
        sent_at timestamptz NOT NULL,
        document_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid REFERENCES app_user(id)
      );
      CREATE TABLE rate_request_leg (
        rate_request_id uuid NOT NULL REFERENCES rate_request(id) ON DELETE CASCADE,
        leg_id uuid NOT NULL REFERENCES leg(id) ON DELETE CASCADE,
        PRIMARY KEY (rate_request_id, leg_id)
      );

      CREATE TABLE rate_response (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        wedding_id uuid NOT NULL REFERENCES wedding(id) ON DELETE CASCADE,
        operator_id uuid NOT NULL REFERENCES operator(id),
        rate_request_id uuid REFERENCES rate_request(id),
        aircraft_id uuid REFERENCES aircraft(id),
        aircraft_text text,
        seats integer CHECK (seats > 0),
        net_rate bigint NOT NULL CHECK (net_rate >= 0),
        inclusions text,
        exclusions text,
        cancellation_terms text,
        valid_until timestamptz,
        received_at timestamptz NOT NULL,
        raw_text text,
        source text NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'AI')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid REFERENCES app_user(id)
      );
      CREATE INDEX rate_response_wedding_idx ON rate_response (wedding_id);

      -- Which legs a rate covers. A package rate covers several legs; cost_share splits its cost for margin reporting.
      CREATE TABLE rate_response_leg (
        rate_response_id uuid NOT NULL REFERENCES rate_response(id) ON DELETE CASCADE,
        leg_id uuid NOT NULL REFERENCES leg(id) ON DELETE CASCADE,
        cost_share bigint NOT NULL CHECK (cost_share >= 0),
        PRIMARY KEY (rate_response_id, leg_id)
      );

      -- The rate(s) chosen for a leg. Several rows = several jets for one leg.
      CREATE TABLE leg_choice (
        leg_id uuid NOT NULL REFERENCES leg(id) ON DELETE CASCADE,
        rate_response_id uuid NOT NULL REFERENCES rate_response(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (leg_id, rate_response_id)
      );
    `);

    // ---------- Quotes, payments, invoices ----------
    await q.query(`
      CREATE TABLE quote (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        wedding_id uuid NOT NULL REFERENCES wedding(id) ON DELETE CASCADE,
        version integer NOT NULL,
        business_profile_id uuid NOT NULL REFERENCES business_profile(id),
        status text NOT NULL DEFAULT 'DRAFT'
          CHECK (status IN ('DRAFT', 'SHARED', 'ACCEPTED', 'EXPIRED', 'SUPERSEDED')),
        valid_until timestamptz,
        gst_rate_bps integer NOT NULL CHECK (gst_rate_bps >= 0),
        gst_sac text,
        invoicing_model text NOT NULL CHECK (invoicing_model IN ('FULL_VALUE', 'FEE_ONLY')),
        place_of_supply_state char(2),
        cancellation_terms text,
        payment_plan_bps integer[] NOT NULL DEFAULT '{10000}',
        commission_basis text CHECK (commission_basis IN ('MARGIN_SHARE', 'BOOKING_PERCENT')),
        commission_bps integer CHECK (commission_bps BETWEEN 0 AND 10000),
        totals jsonb NOT NULL DEFAULT '{}',
        shared_at timestamptz,
        accepted_at timestamptz,
        accepted_name text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid REFERENCES app_user(id),
        UNIQUE (wedding_id, version)
      );

      CREATE TABLE quote_line (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        quote_id uuid NOT NULL REFERENCES quote(id) ON DELETE CASCADE,
        seq integer NOT NULL,
        leg_id uuid REFERENCES leg(id),
        rate_response_id uuid REFERENCES rate_response(id),
        description text NOT NULL,
        cost bigint NOT NULL CHECK (cost >= 0),
        markup_type text CHECK (markup_type IN ('PERCENT', 'FIXED')),
        markup_value bigint,
        sell bigint NOT NULL CHECK (sell >= 0),
        UNIQUE (quote_id, seq)
      );

      CREATE TABLE payment (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        wedding_id uuid NOT NULL REFERENCES wedding(id),
        direction text NOT NULL CHECK (direction IN ('CLIENT_IN', 'OPERATOR_OUT', 'PARTNER_OUT')),
        operator_id uuid REFERENCES operator(id),
        partner_id uuid REFERENCES partner(id),
        amount bigint NOT NULL CHECK (amount > 0),
        tds_bps integer CHECK (tds_bps BETWEEN 0 AND 10000),
        status text NOT NULL CHECK (status IN ('RECORDED', 'PAYABLE', 'PAID')),
        paid_on date,
        mode text NOT NULL DEFAULT 'BANK_TRANSFER' CHECK (mode IN ('BANK_TRANSFER', 'UPI', 'CHEQUE', 'CASH', 'OTHER')),
        reference text,
        receipt_file_id uuid REFERENCES file(id),
        payable_at timestamptz,
        notes text,
        deleted_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid REFERENCES app_user(id),
        CHECK (direction <> 'CLIENT_IN' OR (status = 'RECORDED' AND operator_id IS NULL AND partner_id IS NULL)),
        CHECK (direction <> 'OPERATOR_OUT' OR (operator_id IS NOT NULL AND partner_id IS NULL AND status IN ('PAYABLE', 'PAID'))),
        CHECK (direction <> 'PARTNER_OUT' OR (partner_id IS NOT NULL AND operator_id IS NULL AND status IN ('PAYABLE', 'PAID')))
      );
      CREATE INDEX payment_wedding_idx ON payment (wedding_id) WHERE deleted_at IS NULL;

      CREATE TABLE invoice (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        wedding_id uuid NOT NULL REFERENCES wedding(id),
        business_profile_id uuid NOT NULL REFERENCES business_profile(id),
        quote_id uuid REFERENCES quote(id),
        fy text NOT NULL,
        seq integer NOT NULL,
        number text NOT NULL UNIQUE,
        issued_on date NOT NULL,
        buyer_name text NOT NULL,
        buyer_gstin text,
        place_of_supply_state char(2),
        taxable bigint NOT NULL,
        cgst bigint NOT NULL DEFAULT 0,
        sgst bigint NOT NULL DEFAULT 0,
        igst bigint NOT NULL DEFAULT 0,
        total bigint NOT NULL,
        document_id uuid,
        cancelled_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid REFERENCES app_user(id),
        UNIQUE (business_profile_id, fy, seq)
      );
    `);

    // ---------- Documents and sharing ----------
    await q.query(`
      CREATE TABLE document_template (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        kind text NOT NULL UNIQUE CHECK (kind IN ('CLIENT_TERMS', 'OPERATOR_AGREEMENT', 'REFERRAL_AGREEMENT')),
        name text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE template_version (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        template_id uuid NOT NULL REFERENCES document_template(id) ON DELETE CASCADE,
        version integer NOT NULL,
        body_md text NOT NULL,
        lawyer_approved boolean NOT NULL DEFAULT false,
        approved_on date,
        created_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid REFERENCES app_user(id),
        UNIQUE (template_id, version),
        CHECK (NOT lawyer_approved OR approved_on IS NOT NULL)
      );

      CREATE TABLE document (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        type text NOT NULL CHECK (type IN ('QUOTE', 'CLIENT_TERMS', 'OPERATOR_AGREEMENT', 'REFERRAL_AGREEMENT', 'INVOICE', 'RATE_REQUEST')),
        status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SHARED', 'SIGNED')),
        business_profile_id uuid REFERENCES business_profile(id),
        wedding_id uuid REFERENCES wedding(id),
        leg_id uuid REFERENCES leg(id),
        operator_id uuid REFERENCES operator(id),
        partner_id uuid REFERENCES partner(id),
        quote_id uuid REFERENCES quote(id),
        invoice_id uuid REFERENCES invoice(id),
        rate_request_id uuid REFERENCES rate_request(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid REFERENCES app_user(id)
      );
      CREATE INDEX document_wedding_idx ON document (wedding_id);

      CREATE TABLE document_version (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id uuid NOT NULL REFERENCES document(id) ON DELETE CASCADE,
        version integer NOT NULL,
        template_version_id uuid REFERENCES template_version(id),
        pdf_file_id uuid REFERENCES file(id),
        signed_file_id uuid REFERENCES file(id),
        watermark boolean NOT NULL DEFAULT false,
        audience text NOT NULL CHECK (audience IN ('INTERNAL', 'OUTWARD')),
        created_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid REFERENCES app_user(id),
        UNIQUE (document_id, version)
      );

      CREATE TABLE share (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        document_version_id uuid REFERENCES document_version(id),
        channel text NOT NULL CHECK (channel IN ('WEB_SHARE', 'WHATSAPP', 'TELEGRAM', 'EMAIL', 'INSTAGRAM', 'MESSENGER', 'COPY_LINK', 'DOWNLOAD')),
        recipient text,
        message_text text,
        token_hash text UNIQUE,
        expires_at timestamptz,
        revoked_at timestamptz,
        shared_at timestamptz NOT NULL DEFAULT now(),
        first_opened_at timestamptz,
        open_count integer NOT NULL DEFAULT 0,
        created_by uuid REFERENCES app_user(id)
      );
      CREATE INDEX share_document_version_idx ON share (document_version_id);

      CREATE TABLE share_acceptance (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        share_id uuid NOT NULL REFERENCES share(id) ON DELETE CASCADE,
        name text NOT NULL,
        accepted_at timestamptz NOT NULL DEFAULT now(),
        ip_hash text,
        user_agent text
      );

      ALTER TABLE partner ADD CONSTRAINT partner_referral_document_fk FOREIGN KEY (referral_document_id) REFERENCES document(id);
      ALTER TABLE rate_request ADD CONSTRAINT rate_request_document_fk FOREIGN KEY (document_id) REFERENCES document(id);
      ALTER TABLE invoice ADD CONSTRAINT invoice_document_fk FOREIGN KEY (document_id) REFERENCES document(id);
    `);

    // ---------- Today tasks and audit ----------
    await q.query(`
      -- Today actions are computed by code rules; this only remembers what was marked done or snoozed.
      CREATE TABLE task (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        rule_key text NOT NULL,
        subject_key text NOT NULL,
        status text NOT NULL CHECK (status IN ('DONE', 'SNOOZED')),
        snoozed_until timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid REFERENCES app_user(id),
        UNIQUE (rule_key, subject_key),
        CHECK (status <> 'SNOOZED' OR snoozed_until IS NOT NULL)
      );

      CREATE TABLE audit_log (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        actor_type text NOT NULL CHECK (actor_type IN ('USER', 'AI', 'SYSTEM', 'PUBLIC')),
        actor_id uuid,
        entity text NOT NULL,
        entity_id text NOT NULL,
        action text NOT NULL,
        diff jsonb,
        at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX audit_log_entity_idx ON audit_log (entity, entity_id, at DESC);
    `);

    const withUpdatedAt = [
      'app_user',
      'setting',
      'business_profile',
      'partner',
      'client',
      'operator',
      'aircraft',
      'wedding',
      'leg',
      'guest',
      'rate_response',
      'quote',
      'payment',
      'document',
      'task',
    ];
    for (const table of withUpdatedAt) {
      await q.query(
        `CREATE TRIGGER ${table}_updated_at BEFORE UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
      );
    }
  }

  async down(q: QueryRunner): Promise<void> {
    const tables = [
      'audit_log',
      'task',
      'share_acceptance',
      'share',
      'document_version',
      'invoice',
      'payment',
      'quote_line',
      'quote',
      'leg_choice',
      'rate_response_leg',
      'rate_response',
      'rate_request_leg',
      'rate_request',
      'document',
      'template_version',
      'document_template',
      'guest',
      'leg',
      'enquiry',
      'wedding',
      'operator_document',
      'aircraft',
      'operator_contact',
      'operator_base',
      'operator',
      'consent',
      'client',
      'partner_activity',
      'partner',
      'invoice_sequence',
      'business_profile',
      'file_access_log',
      'file',
      'airport',
      'setting',
      'refresh_token',
      'app_user',
    ];
    for (const table of tables) await q.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
    await q.query('DROP SEQUENCE IF EXISTS wedding_number_seq');
    await q.query('DROP FUNCTION IF EXISTS set_updated_at()');
  }
}
