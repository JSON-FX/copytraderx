/**
 * @jest-environment jsdom
 */
import {
  ADMIN_SUBS_PAGE_SIZE_KEY,
  getAdminSubsPageSize,
  setAdminSubsPageSize,
} from "./admin-settings";
import { ADMIN_SUBS_PAGE_SIZE_DEFAULT } from "./dashboard-filters";

beforeEach(() => {
  window.localStorage.clear();
});

describe("getAdminSubsPageSize", () => {
  it("returns the default when nothing is stored", () => {
    expect(getAdminSubsPageSize()).toBe(ADMIN_SUBS_PAGE_SIZE_DEFAULT);
  });

  it("returns the stored value when it is a valid option", () => {
    window.localStorage.setItem(ADMIN_SUBS_PAGE_SIZE_KEY, "50");
    expect(getAdminSubsPageSize()).toBe(50);
  });

  it("falls back to the default when the stored value is not a valid option", () => {
    window.localStorage.setItem(ADMIN_SUBS_PAGE_SIZE_KEY, "37");
    expect(getAdminSubsPageSize()).toBe(ADMIN_SUBS_PAGE_SIZE_DEFAULT);
  });

  it("falls back to the default when the stored value is not numeric", () => {
    window.localStorage.setItem(ADMIN_SUBS_PAGE_SIZE_KEY, "many");
    expect(getAdminSubsPageSize()).toBe(ADMIN_SUBS_PAGE_SIZE_DEFAULT);
  });
});

describe("setAdminSubsPageSize", () => {
  it("writes the value to localStorage", () => {
    setAdminSubsPageSize(25);
    expect(window.localStorage.getItem(ADMIN_SUBS_PAGE_SIZE_KEY)).toBe("25");
  });
});
