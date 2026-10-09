export const airport = (code: string) => ({
  iata_code: code,
  name: `${code} airport`,
});
const airline = { name: "Duffel Airways", iata_code: "ZZ" };
const segment = (from: string, to: string, depart: string, arrive: string) => ({
  id: `${from}-${to}`,
  origin: airport(from),
  destination: airport(to),
  departing_at: depart,
  arriving_at: arrive,
  duration: "PT2H30M",
  marketing_carrier: airline,
  marketing_carrier_flight_number: "123",
  operating_carrier: airline,
  stops: [],
  passengers: [
    {
      passenger_id: "pas_1",
      cabin_class: "economy",
      baggages: [{ type: "checked", quantity: 1 }],
    },
  ],
});

export const supplierOffer = {
  id: "off_test123_0",
  live_mode: false,
  owner: airline,
  total_amount: "450.25",
  total_currency: "USD",
  expires_at: "2099-10-01T12:00:00Z",
  passengers: [
    { id: "pas_1", type: "adult" },
    { id: "pas_2", type: "adult" },
  ],
  conditions: {
    refund_before_departure: null,
    change_before_departure: {
      allowed: true,
      penalty_amount: "25.00",
      penalty_currency: "USD",
    },
  },
  slices: [
    {
      id: "sli_out",
      duration: "PT6H",
      segments: [
        segment("BOM", "AUH", "2099-10-14T22:00:00", "2099-10-15T00:30:00"),
        segment("AUH", "DXB", "2099-10-15T01:00:00", "2099-10-15T02:00:00"),
      ],
    },
    {
      id: "sli_back",
      duration: "PT3H",
      segments: [
        segment("DXB", "BOM", "2099-10-21T16:00:00", "2099-10-21T20:30:00"),
      ],
    },
  ],
};
