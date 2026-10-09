# Flight supplier enquiries (drafts)

Ready to send manually. Nothing here has been sent. Replace every `[bracket]` before sending.

**Everything happens by email (no calls). The one requirement every supplier must confirm in writing:** Flitel pays nothing before a booking. No card, deposit, wallet top-up, credit line or fee from us beforehand. The customer's card is charged at the moment the ticket is booked, and our margin is settled afterwards.

## Where to send each one

| # | Supplier | Send to | Why they're on the list |
|---|---|---|---|
| 1 | Travelfusion | Contact form: https://corporate.travelfusion.com | Their airline pages say airlines can be paid with "your users' cards"; IndiGo is listed. Strongest lead. |
| 2 | Verteil | sales@verteil.com | Indian NDC aggregator; lists credit-card payment for Air India |
| 3 | Air India NDC | ndcdistribution@airindia.com (portal: https://ndc.airindia.com) | The airline itself could charge the customer's card |
| 4 | Duffel | Support or account manager, from your Duffel dashboard | Already integrated in Flitel; ask whether the billing-card requirement can be waived when customers pay by card |
| 5 | Travel House International | sales@travel-house-international.com | Advertises free setup and no deposit (for its portal) |
| 6 | Mystifly | Contact form: https://mystifly.com/contact/ | Has an API and an India presence; payment terms unpublished |
| 7 | Tripjack | "Sign up for API" form: https://tripjack.com/nav/api | Indian B2B API; uses a prepaid wallet by default, so ask for an exception |
| 8 | Etrav Tech | Enquiry via https://www.etrav.in or https://b2b.etrav.in | Indian API / white label; terms unpublished |
| 9 | TBO | Registration / sales contact on the TBO website | Free registration; its API deducts from an agency wallet, so ask for an exception |
| 10 | Kiwi.com | Partner contact: https://tequila.kiwi.com | Booking API; docs mention a partner deposit or card, so ask for an exception |

Send 1–4 first. 5–10 have published terms that point towards a wallet or deposit, so treat them as backups.

---

## 1. Travelfusion

**Subject:** API partnership — customer-card payment only, no deposit (Indian B2C startup)

Hello Travelfusion team,

**Before anything else, our one essential requirement:** we can only go live if Flitel pays nothing before a booking. That means no deposit, no prepaid wallet, no credit line, no company card and no fees up front. The customer's own card must be charged at the moment the ticket is booked, with our margin settled afterwards. Can you support this?

I'm [your name], founder of Flitel ([website]), a B2C flight booking web app based in India. Customers search, enter traveller details, pay and receive confirmation entirely on our own website, so we need a booking API, not a white-label site.

Your airline pages mention paying airlines with "your users' cards". Could you confirm in writing:

1. Whether we can go live using only the customer's card, charged by the airline (or by you) at the time of booking, with nothing on file from us. We understand tfPay needs a deposit, so we would not use tfPay.
2. Every fee before our first live booking (setup, licence, certification, monthly or minimum volumes). We need these to be zero, or taken only from bookings.
3. Which airlines support customer-card payment through your API, especially IndiGo, Air India, Akasa Air and SpiceJet, and whether INR is supported.
4. Whether you onboard non-IATA Indian startups, and which documents you need (GST, PAN, certificate of incorporation).
5. Whether customer emails, e-tickets and booking contacts can show only our brand.
6. Who handles refunds, cancellations and chargebacks, and our liability for each.
7. The time and steps from sandbox to production.

Please reply in writing. Thank you.

Regards,
[your name]
[company name], [city], India
[phone] · [email]

---

## 2. Verteil

**Subject:** NDC API onboarding — customer-card payment only, no deposit (Flitel, India)

Hello Verteil team,

**Our one essential requirement first:** Flitel must pay nothing before a booking. That means no deposit, no wallet, no credit line, no company card and no upfront fees. The customer's card must be charged when the ticket is booked, with our margin settled afterwards. Is this possible with Verteil?

I'm [your name], founder of Flitel ([website]), an Indian B2C flight booking web app. We want to sell flights through our own checkout using your NDC API, with our branding throughout.

Could you please confirm in writing:

1. Whether the customer's card can be passed through and charged directly by the airline at booking, with nothing on file from us, and for which airlines (Air India, IndiGo, Akasa, others).
2. Whether that requires IATA/BSP accreditation, and if so, whether there is a route for non-accredited startups.
3. All fees before the first live booking (setup, licence, certification, monthly or minimum volumes).
4. The KYC documents you need.
5. Settlement currency (INR?) and who bears card or FX fees.
6. Whether emails, e-tickets and booking contacts can carry only the Flitel brand.
7. Refund, cancellation and chargeback handling, and our liability.
8. The time and steps from sandbox to production.

Please reply in writing; happy to share more details by email. Thank you.

Regards,
[your name]
[company name], [city], India
[phone] · [email]

---

## 3. Air India NDC

**Subject:** NDC direct connect — customer-card payment with no agency deposit (Flitel, India)

Dear Air India NDC Distribution team,

**Our key requirement:** Flitel can only sell if it pays nothing before a booking. That means no deposit, no agency card and no upfront fees. The customer's own card would be charged by Air India, as merchant, at the time of booking.

I'm [your name], founder of Flitel ([website]), an Indian B2C flight booking web app. We would like to sell Air India fares through your NDC API on our own website.

Could you please let us know:

1. Whether a partner can use the customer's credit/debit card with Air India as merchant, so that no deposit, BSP cash or agency card is needed.
2. The eligibility criteria for a direct NDC connection, including whether IATA accreditation is required.
3. Any fees before the first live booking.
4. Settlement currency and timelines for our commission or markup.
5. Whether booking confirmations and e-tickets can show our brand as the seller.
6. The certification steps and typical time to go live.

Thank you for your time.

Regards,
[your name]
[company name], [city], India
[phone] · [email]

---

## 4. Duffel

**Subject:** Going live without an owner billing card — customer card payments (Flitel)

Hello Duffel team,

We have built Flitel ([website]) on the Duffel Flights API in test mode, and test bookings work end to end.

**Our one blocker for going live:** we can't put an owner billing card or any funds on the account before bookings start. We want each ticket paid by the customer's own card at the moment of booking (Duffel Payments / card payments), with any Duffel fees taken from bookings rather than charged up front.

Could you confirm in writing:

1. Whether live activation can be completed without adding a billing card, if every order is paid by the customer's card through Duffel's card payments.
2. Whether card payments can be approved for us, and what the approval needs (company documents, volumes, India eligibility).
3. Whether all Duffel fees (per order, card processing, FX) can be deducted from bookings, with nothing charged before the first order.
4. Whether INR pricing and payouts of our markup to an Indian bank account are supported.
5. Whether customer-facing emails and e-tickets can carry only our brand.

Thank you.

Regards,
[your name]
[company name], [city], India
[phone] · [email]

---

## 5. Travel House International

**Subject:** Flight API registration — no deposit, customer-card payment, our own app

Hello Travel House team,

**Our one essential requirement:** Flitel must pay nothing before a booking. That means no deposit, no wallet, no card from us and no registration or monthly fees. The customer's card must be charged at booking.

I'm [your name], founder of Flitel ([website]). Your site advertises "Free and Fast Setup" and "No Deposit No Long Term Contract" for white label. We already have our own web app and need a flight booking API behind it.

Could you confirm in writing:

1. Whether the no-deposit, no-fee terms also apply to API access.
2. Whether the customer's card can be charged at booking, so we never pre-fund tickets or give our own card.
3. Whether booking, checkout and confirmation can happen fully inside our app, with only our branding on emails and tickets.
4. Production access for a business in India, with INR pricing.
5. Your current flight API documentation (authentication, search, booking, payment, ticketing).

Thank you.

Regards,
[your name]
[company name], [city], India
[phone] · [email]

---

## 6. Mystifly

**Subject:** Flight API — customer-card payment only, no deposit (Flitel, India)

Hello Mystifly team,

**Our one essential requirement:** Flitel can only go live if it pays nothing before a booking. That means no deposit, no wallet, no credit line, no company card and no upfront fees. The customer's card must be charged at the moment the ticket is booked.

I'm [your name], founder of Flitel ([website]), an Indian B2C flight booking web app with its own checkout. We are looking for a flight booking API.

Could you confirm in writing:

1. Whether bookings can be paid with the customer's card at the time of booking, with nothing pre-funded by us. Your payments page mentions same-day to 7-day settlement; is any deposit or guarantee required for that?
2. Every fee before our first live booking.
3. Whether you onboard non-IATA Indian startups, and the KYC you need.
4. Indian airline coverage (IndiGo, Air India, Akasa, SpiceJet) and INR support.
5. Whether all customer-facing material can show only our brand.
6. Refund, cancellation and chargeback handling.
7. The time from sandbox to production.

Thank you.

Regards,
[your name]
[company name], [city], India
[phone] · [email]

---

## 7. Tripjack

**Subject:** API access without a prepaid wallet — customer-card payment (Flitel)

Hello Tripjack team,

**Our one essential requirement:** Flitel can't pre-fund a wallet or put up a deposit or card before bookings. We need each ticket paid by the customer's card at the moment of booking, with our margin settled afterwards.

I'm [your name], founder of Flitel ([website]), an Indian B2C flight booking web app. We'd like to use your flight API behind our own checkout.

Could you confirm in writing:

1. Whether API bookings can be paid by the customer's card at booking instead of from a prepaid wallet. If the wallet is mandatory, is there a zero-balance or pay-per-booking option?
2. Every fee before our first live booking (agreement, certification, monthly).
3. Whether customer emails and tickets can carry only our brand.
4. The KYC documents you need, and the time from IAT testing to go-live.

Thank you.

Regards,
[your name]
[company name], [city], India
[phone] · [email]

---

## 8. Etrav Tech

**Subject:** Flight API enquiry — no deposit, customer-card payment (Flitel)

Hello Etrav team,

**Our one essential requirement:** Flitel must pay nothing before a booking. That means no wallet top-up, no deposit, no card from us and no upfront fees. The customer's card must be charged when the ticket is booked.

I'm [your name], founder of Flitel ([website]), an Indian B2C flight booking web app with its own checkout.

Could you confirm in writing:

1. Whether your flight API supports customer-card payment at booking, with nothing pre-funded by us.
2. Every fee before our first live booking.
3. Whether customer-facing emails and tickets can show only our brand.
4. Your API documentation, KYC requirements and time to go live.

Thank you.

Regards,
[your name]
[company name], [city], India
[phone] · [email]

---

## 9. TBO

**Subject:** Air API — can bookings be customer-card funded instead of wallet-funded? (Flitel)

Hello TBO team,

**Our one essential requirement:** Flitel can't pre-fund an agency wallet or give a deposit or card before bookings. We need each ticket paid by the customer's card at the moment of booking.

I'm [your name], founder of Flitel ([website]), an Indian B2C flight booking web app. Your Air API guide says ticket costs are deducted from the agency account.

Could you confirm in writing:

1. Whether there is any option where tickets are paid by the customer's card at booking (for example through your payment gateway, or the airline as merchant) instead of from a pre-funded wallet.
2. If a wallet is mandatory, whether a zero or near-zero balance with instant settlement per booking is allowed.
3. Every fee before our first live booking.
4. Whether customer-facing emails and tickets can carry only our brand.
5. How to get staging (test) API credentials, and the time to go live.

Thank you.

Regards,
[your name]
[company name], [city], India
[phone] · [email]

---

## 10. Kiwi.com

**Subject:** Booking API partnership — customer-card payment, no deposit (Flitel, India)

Hello Kiwi.com partnerships team,

**Our one essential requirement:** Flitel must pay nothing before a booking. That means no deposit account, no company card and no upfront fees. The customer's card must be charged at the moment of booking.

I'm [your name], founder of Flitel ([website]), an Indian B2C flight booking web app with its own checkout. We'd like to use Kiwi.com's booking API.

Could you confirm in writing:

1. Whether bookings can be paid by the customer's card at booking, rather than from a partner deposit or partner card.
2. Every fee before our first live booking, and whether a commercial agreement is required.
3. India coverage and INR support.
4. Whether customer-facing emails and tickets can carry only our brand.
5. The time and steps to production access.

Thank you.

Regards,
[your name]
[company name], [city], India
[phone] · [email]
