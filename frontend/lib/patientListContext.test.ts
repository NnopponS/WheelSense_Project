import {
  buildPatientListHref,
  getSafePatientListReturnTo,
  parsePatientListFilter,
  withPatientListReturnTo,
} from "./patientListContext";

describe("patient list context", () => {
  it("normalizes supported filters and rejects unknown values", () => {
    expect(parsePatientListFilter("critical")).toBe("critical");
    expect(parsePatientListFilter("unknown")).toBe("all");
    expect(parsePatientListFilter(null)).toBe("all");
  });

  it("stores non-default search and filter state in the list URL", () => {
    expect(
      buildPatientListHref(
        "/admin/patients",
        new URLSearchParams("source=dashboard"),
        "  Mali  ",
        "critical",
      ),
    ).toBe("/admin/patients?source=dashboard&q=Mali&view=critical");

    expect(
      buildPatientListHref(
        "/admin/patients",
        new URLSearchParams("q=old&view=recent"),
        "",
        "all",
      ),
    ).toBe("/admin/patients");
  });

  it("adds return context without dropping detail query or hash state", () => {
    expect(
      withPatientListReturnTo(
        "/admin/patients/42?tab=care#timeline",
        "/admin/patients?q=Mali&view=critical",
      ),
    ).toBe(
      "/admin/patients/42?tab=care&returnTo=%2Fadmin%2Fpatients%3Fq%3DMali%26view%3Dcritical#timeline",
    );
  });

  it("accepts only same-route internal return targets", () => {
    const fallback = "/admin/patients";

    expect(getSafePatientListReturnTo("/admin/patients?q=Mali&view=critical", fallback)).toBe(
      "/admin/patients?q=Mali&view=critical",
    );
    expect(getSafePatientListReturnTo("https://evil.example/admin/patients", fallback)).toBe(fallback);
    expect(getSafePatientListReturnTo("/admin/patients/archive", fallback)).toBe(fallback);
    expect(
      getSafePatientListReturnTo(
        "/admin/personnel?tab=patients&q=Mali",
        fallback,
        ["/admin/personnel"],
      ),
    ).toBe("/admin/personnel?tab=patients&q=Mali");
  });
});
