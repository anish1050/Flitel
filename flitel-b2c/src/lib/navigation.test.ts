import { expect, it } from "vitest";
import { isNewPage, shouldAnimateFlight } from "./navigation";

it("animates page and search changes but leaves same-page anchors alone", () => {
  const home = "http://localhost:3000/";
  expect(isNewPage(home, "/flights?to=DXB")).toBe(true);
  expect(isNewPage(`${home}flights?to=DXB`, "/flights?to=SIN")).toBe(true);
  expect(isNewPage(home, "/#destinations")).toBe(false);
  expect(isNewPage(`${home}#destinations`, home)).toBe(false);
  expect(isNewPage(home, home)).toBe(false);
});

it("plays the plane only for flight journeys, never when a hotel page is involved", () => {
  const home = "http://localhost:3000/";
  expect(shouldAnimateFlight(home, "/flights?to=DXB")).toBe(true);
  expect(shouldAnimateFlight(`${home}flights?to=DXB`, "/flights/off_1?to=DXB")).toBe(true);
  expect(shouldAnimateFlight(`${home}flights/off_1/book`, "/bookings/ord_1")).toBe(true);

  expect(shouldAnimateFlight(home, "/hotels")).toBe(false);
  expect(shouldAnimateFlight(`${home}hotels?destination=goa`, "/hotels/lp1?destination=goa")).toBe(false);
  expect(shouldAnimateFlight(`${home}hotels/lp1`, "/hotels/lp1/book?offerId=x")).toBe(false);
  expect(shouldAnimateFlight(`${home}hotels/complete?attempt=1`, "/hotel-bookings/FK1?ref=u")).toBe(false);
  expect(shouldAnimateFlight(`${home}hotels?destination=goa`, "/")).toBe(false);
  expect(shouldAnimateFlight(`${home}hotels`, "/flights")).toBe(false);
});

it("still ignores same-page changes on hotel pages", () => {
  expect(shouldAnimateFlight("http://localhost:3000/hotels", "/hotels")).toBe(false);
});
