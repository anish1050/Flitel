import { expect, it } from "vitest";
import { isNewPage } from "./navigation";

it("animates page and search changes but leaves same-page anchors alone", () => {
  const home = "http://localhost:3000/";
  expect(isNewPage(home, "/flights?to=DXB")).toBe(true);
  expect(isNewPage(`${home}flights?to=DXB`, "/flights?to=SIN")).toBe(true);
  expect(isNewPage(home, "/#destinations")).toBe(false);
  expect(isNewPage(`${home}#destinations`, home)).toBe(false);
  expect(isNewPage(home, home)).toBe(false);
});
