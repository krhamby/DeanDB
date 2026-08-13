import { describe, it, expect } from "vitest";
import { coverArtUrl, canonicalCoverUrl } from "./musicbrainz";

describe("coverArtUrl", () => {
  it("returns a proxy-relative path for a release-group MBID", () => {
    const mbid = "5b11f4ce-a62d-471e-81fc-a69a8278c7da";
    expect(coverArtUrl(mbid)).toBe(`/api/coverart/release-group/${mbid}/front-250`);
  });
});

describe("canonicalCoverUrl", () => {
  it("converts proxy-relative path to canonical CAA URL", () => {
    const mbid = "5b11f4ce-a62d-471e-81fc-a69a8278c7da";
    const proxyUrl = `/api/coverart/release-group/${mbid}/front-250`;
    const expected = `https://coverartarchive.org/release-group/${mbid}/front-250`;
    expect(canonicalCoverUrl(proxyUrl)).toBe(expected);
  });

  it("passes through absolute https URLs unchanged", () => {
    const absoluteUrl = "https://coverartarchive.org/release-group/5b11f4ce-a62d-471e-81fc-a69a8278c7da/front-250";
    expect(canonicalCoverUrl(absoluteUrl)).toBe(absoluteUrl);
  });

  it("passes through absolute http URLs unchanged", () => {
    const absoluteUrl = "http://coverartarchive.org/release-group/5b11f4ce-a62d-471e-81fc-a69a8278c7da/front-250";
    expect(canonicalCoverUrl(absoluteUrl)).toBe(absoluteUrl);
  });

  it("roundtrips coverArtUrl → canonicalCoverUrl to canonical form", () => {
    const mbid = "5b11f4ce-a62d-471e-81fc-a69a8278c7da";
    const proxyUrl = coverArtUrl(mbid);
    const canonical = canonicalCoverUrl(proxyUrl);
    const expected = `https://coverartarchive.org/release-group/${mbid}/front-250`;
    expect(canonical).toBe(expected);
  });
});
