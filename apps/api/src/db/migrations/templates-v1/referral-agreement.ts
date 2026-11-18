/** Partner Referral Agreement, version 1 (DRAFT for the lawyer's review). */
export const REFERRAL_AGREEMENT_V1 = `# PARTNER REFERRAL AGREEMENT

This Partner Referral Agreement (the **"Agreement"**) is made at **{{place}}** on **{{date}}**.

**BETWEEN**

**{{us.legal_name}}**, a limited liability partnership bearing LLPIN **{{us.llpin}}** and GSTIN **{{us.gstin}}**, having its registered office at {{us.address}}, carrying on business under the brand **{{us.brand}}**, acting through its authorised signatory {{us.signatory_name}}, {{us.signatory_designation}} (the **"Company"**) of the **ONE PART**;

**AND**

**{{partner.firm}}**, of {{partner.address}}, {{partner.city}}, GSTIN (if registered) {{partner.gstin}}, represented by {{partner.contact_person}} (the **"Partner"**) of the **OTHER PART**.

## RECITALS

**(A)** The Company arranges private charter flights for guests of weddings and events in India as an intermediary with licensed aircraft operators.

**(B)** The Partner plans or hosts weddings and events and wishes to refer its clients to the Company for charter flights, in return for a referral commission.

**NOW, THEREFORE**, the Parties agree as follows:

## 1. DEFINITIONS

**1.1** **"Referred Client"** means a client introduced by the Partner to the Company in writing (including by WhatsApp or email) and not already in active discussion with the Company; **"Booking"** means flights arranged by the Company for a Referred Client; **"Booking Value"** means the price paid by the Referred Client for a Booking, excluding GST; **"Margin"** means the Booking Value less the amounts payable by the Company to the aircraft operator for that Booking, excluding GST.

## 2. REFERRALS

**2.1** The Partner may refer clients to the Company. The Company decides in its sole discretion whether to quote for and accept any Booking.

**2.2** A referral is registered when the Company acknowledges it in writing. If two partners refer the same client, the first registered referral counts.

## 3. COMMISSION

**3.1** For each Booking with a Referred Client, the Company shall pay the Partner a commission of **{{partner.commission}}**.

**3.2** Commission is **earned only when** (a) the Referred Client has paid the Company in full for the Booking, and (b) the flights of the Booking have been operated. No commission is payable on Bookings that are cancelled or refunded, or on amounts not received by the Company.

**3.3** The Company shall pay earned commission within [●] days after the end of the month in which it is earned, by bank transfer to the account notified by the Partner, together with a statement of the Bookings concerned.

**3.4** Commission is subject to deduction of tax at source as required by law. If the Partner is registered under GST, it shall raise a valid tax invoice for the commission and GST shall be payable in addition.

**3.5** The Company's statement of the Booking Value and Margin is final, save for manifest error. The Partner is not entitled to see the Company's operator rates.

## 4. CONDUCT

**4.1** The Partner is an independent party. The Partner has no authority to make any promise, quote any price, accept any booking or bind the Company in any way.

**4.2** The Partner shall not describe itself as an agent, employee or partner of the Company, and shall use the Company's name and brand only as approved by the Company.

**4.3** The Partner shall share a client's personal data with the Company only with that client's consent, in compliance with the Digital Personal Data Protection Act, 2023.

## 5. NON-CIRCUMVENTION BY THE COMPANY

**5.1** The Company shall not bypass the Partner with a Referred Client. For **[●] months** after a referral is registered, every Booking by that Referred Client with the Company earns commission for the Partner under clause 3, even if the Referred Client contacts the Company directly.

## 6. CONFIDENTIALITY

**6.1** Each Party shall keep confidential the other's business information, including prices, commissions and client details, and use it only for the purpose of this Agreement, during the term and for two (2) years after it ends.

## 7. TERM AND TERMINATION

**7.1** This Agreement starts on the date above and continues for [●] year(s), renewing automatically for further periods of one year unless either Party gives [●] days' written notice.

**7.2** Either Party may terminate this Agreement by [●] days' written notice, or immediately for material breach by the other.

**7.3** Commission earned on Bookings made before termination remains payable. Clauses 5 and 6 survive termination for the periods stated.

## 8. GOVERNING LAW AND DISPUTES

**8.1** This Agreement is governed by the laws of India. Any dispute shall be referred to arbitration by a sole arbitrator under the Arbitration and Conciliation Act, 1996, with seat and venue at **{{us.arbitration_city}}**, in English.

## 9. GENERAL

**9.1** This Agreement is the entire agreement between the Parties on its subject and may be amended only in writing signed by both Parties. Neither Party may assign it without the other's written consent.

**IN WITNESS WHEREOF** the Parties have signed this Agreement on the date and at the place first written above.

| For **{{us.legal_name}}** | For **{{partner.firm}}** |
|---|---|
| Signature: ______________________ | Signature: ______________________ |
| Name: {{us.signatory_name}} | Name: {{partner.contact_person}} |
| Designation: {{us.signatory_designation}} | Designation: ______________________ |
| Date: ______________________ | Date: ______________________ |

> **Execution note.** This Agreement is to be executed on non-judicial stamp paper or an e-stamp certificate of the value payable under the stamp law of the State where it is executed. It may be signed with an electronic signature under the Information Technology Act, 2000 (including Aadhaar-based e-Sign).
`;
