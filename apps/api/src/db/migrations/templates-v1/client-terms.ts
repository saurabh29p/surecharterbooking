/** Client Charter Terms and Booking Confirmation, version 1 (DRAFT for the lawyer's review). */
export const CLIENT_TERMS_V1 = `# CHARTER TERMS AND BOOKING CONFIRMATION

Booking **{{wedding.code}}** · Quote **{{quote.reference}}** dated {{quote.date}}

These Charter Terms and Booking Confirmation (the **"Terms"**) are made at **{{place}}** on **{{date}}**.

**BETWEEN**

**{{us.legal_name}}**, a limited liability partnership bearing LLPIN **{{us.llpin}}** and GSTIN **{{us.gstin}}**, having its registered office at {{us.address}}, carrying on business under the brand **{{us.brand}}** (the **"Broker"**) of the **ONE PART**;

**AND**

**{{client.name}}**, of {{client.address}}, GSTIN (if registered) {{client.gstin}}, phone {{client.phone}}, email {{client.email}} (the **"Client"**) of the **OTHER PART**.

## RECITALS

**(A)** The Client has asked the Broker to arrange private charter flights for guests of the wedding at **{{wedding.city}}** on **{{wedding.dates}}**.

**(B)** The Broker arranges such flights as an intermediary with licensed operators holding a Non-Scheduled Operator Permit issued by the Directorate General of Civil Aviation (**"DGCA"**). The Broker does not own or operate aircraft.

**(C)** The Client has accepted the Broker's quote referred to above, and the Parties record the terms of the booking below.

## 1. DEFINITIONS

**1.1** **"Operator"** means the licensed operator named for each flight in clause 2, which operates the flight as the carrier; **"Flights"** means the flights listed in clause 2; **"Passengers"** means the guests travelling on the Flights; **"Price"** means the total price in clause 3.

## 2. ITINERARY, AIRCRAFT AND OPERATORS

**2.1** The Broker shall arrange the following Flights:

{{quote.itinerary}}

**2.2** Departure times are windows in Indian Standard Time and are subject to air traffic control, airport and weather conditions. The Operator may substitute an aircraft of the same or a higher category with at least the same number of seats; the Broker shall inform the Client of any substitution.

## 3. PRICE AND WHAT IS INCLUDED

**3.1** The total Price is **{{quote.total}}** ({{quote.total_words}}), including GST.

**3.2** Included: {{quote.inclusions}}

**3.3** Not included: {{quote.exclusions}}

## 4. PAYMENT

**4.1** The Client shall pay the Price by bank transfer as follows:

{{quote.payment_schedule}}

**4.2** The booking is confirmed only when these Terms are signed and the payment required to confirm it is received. Until then aircraft and prices are not held and depend on availability.

**4.3** The Broker shall issue a GST tax invoice for amounts received.

## 5. CANCELLATIONS AND CHANGES

**5.1** If the Client cancels all or part of the booking, the following charges apply, as a percentage of the Price of the cancelled Flights, by how long before the scheduled departure the cancellation is notified in writing:

{{quote.cancellation_table}}

**5.2** {{quote.cancellation_note}}

**5.3** Changes of date, time, route or passenger numbers are subject to aircraft availability and may change the Price. A change is effective only when confirmed in writing by the Broker.

**5.4** If a Flight cannot operate for reasons of safety, weather, or the decisions of aviation authorities, the Broker shall in good faith arrange a new date or, where that is not possible, refund the amount paid for that Flight less charges that cannot be recovered from the Operator.

## 6. PASSENGERS, IDENTITY AND BAGGAGE

**6.1** The Client shall provide the full name and a valid government photo identity document of every Passenger at least [●] days before the Flight. Passengers must carry the same identity document when travelling.

**6.2** The Operator and the pilot-in-command may refuse carriage to any Passenger who is intoxicated, behaves in a disorderly manner, cannot produce valid identity, or whose carriage may endanger the flight.

**6.3** Baggage allowance depends on the aircraft and is [●] kg per Passenger unless agreed otherwise in writing. Dangerous goods, weapons and prohibited items may not be carried. The Operator may decline baggage that exceeds the safe limits of the aircraft.

## 7. ROLE OF THE BROKER AND THE OPERATOR

**7.1** The Broker acts only as an intermediary that arranges the Flights. Each Flight is operated by the Operator named in clause 2, which is the carrier and keeps full operational control of the Flight.

**7.2** The pilot-in-command has final authority over the operation of each Flight, including any delay, diversion or cancellation for reasons of safety or weather.

## 8. LIABILITY

**8.1** Liability for death, injury, loss of or damage to baggage, and delay in carriage rests with the Operator as carrier, in accordance with the Carriage by Air Act, 1972 and other applicable law.

**8.2** The Broker is liable only for its own acts and omissions in arranging the Flights. The Broker is not liable for indirect or consequential losses, including missed events or onward arrangements. The Broker's total liability under these Terms shall not exceed the Price paid to it.

## 9. PERSONAL DATA

**9.1** The Client confirms that it has informed each Passenger that their name, phone number and identity document will be shared with the Broker and the Operator for the purpose of the Flights and legal requirements.

**9.2** The Broker processes such data under the Digital Personal Data Protection Act, 2023, keeps identity documents encrypted, and deletes them within [●] days after the last Flight unless the law requires longer retention.

## 10. FORCE MAJEURE

**10.1** Neither Party is liable for failure or delay caused by events beyond its reasonable control, including weather, airport closure, air traffic control restrictions, government action, epidemic, strike or natural disaster. Clause 5.4 applies to the affected Flights.

## 11. DISPUTES

**11.1** These Terms are governed by the laws of India. The Parties shall first try to settle any dispute by discussion. Any dispute not settled within 30 days shall be referred to arbitration by a sole arbitrator under the Arbitration and Conciliation Act, 1996, with seat and venue at **{{us.arbitration_city}}**, in English. Subject to this, the courts at {{us.arbitration_city}} shall have exclusive jurisdiction.

## 12. GENERAL

**12.1** These Terms, together with the quote referred to above, are the entire agreement between the Parties on their subject. If they differ, these Terms prevail.

**12.2** Any amendment must be in writing (including by email or WhatsApp) and confirmed by the Broker.

**IN WITNESS WHEREOF** the Parties have signed these Terms on the date and at the place first written above.

| For **{{us.legal_name}}** | **Client** |
|---|---|
| Signature: ______________________ | Signature: ______________________ |
| Name: {{us.signatory_name}} | Name: {{client.name}} |
| Designation: {{us.signatory_designation}} | Date: ______________________ |
| Date: ______________________ | |

> **Execution note.** These Terms may be signed on paper or with an electronic signature under the Information Technology Act, 2000 (including Aadhaar-based e-Sign). Where stamp duty is payable under the stamp law of the State of execution, they shall be executed on non-judicial stamp paper or with an e-stamp certificate of the applicable value.
`;
