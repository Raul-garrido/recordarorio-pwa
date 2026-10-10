import { describe, expect, it } from "vitest";
import { normUrl, parseMapsLink, parseShared, platformOf } from "./links";

describe("parseMapsLink", () => {
  it("prefers the place coordinates (!3d!4d) over the viewport centre (@)", () => {
    const r = parseMapsLink(
      "https://www.google.com/maps/place/Casa+Labra/@40.4170,-3.7060,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d40.4176!4d-3.7053",
    );
    expect(r.coords).toEqual({ lat: 40.4176, lng: -3.7053 });
    expect(r.name).toBe("Casa Labra");
    expect(r.isMaps).toBe(true);
  });

  it("reads @lat,lng when there is nothing better", () => {
    expect(parseMapsLink("https://www.google.com/maps/@40.4153,-3.6844,15z").coords).toEqual({ lat: 40.4153, lng: -3.6844 });
  });

  it("reads ?q= and ?query= coordinates", () => {
    expect(parseMapsLink("https://maps.google.com/?q=40.41,-3.70").coords).toEqual({ lat: 40.41, lng: -3.7 });
    expect(parseMapsLink("https://www.google.com/maps/search/?api=1&query=40.4,-3.7").coords).toEqual({ lat: 40.4, lng: -3.7 });
  });

  it("keeps a text ?q= as a search query", () => {
    const r = parseMapsLink("https://maps.google.com/?q=Mercado+de+San+Miguel+Madrid");
    expect(r.coords).toBeNull();
    expect(r.query).toBe("Mercado de San Miguel Madrid");
  });

  it("accepts plain coordinates and geo: URIs", () => {
    expect(parseMapsLink(" 40.4240, -3.7177 ").coords).toEqual({ lat: 40.424, lng: -3.7177 });
    expect(parseMapsLink("geo:40.4,-3.7").coords).toEqual({ lat: 40.4, lng: -3.7 });
  });

  it("flags short links that carry no location", () => {
    const r = parseMapsLink("https://maps.app.goo.gl/AbC123xyz");
    expect(r.isShort).toBe(true);
    expect(r.coords).toBeNull();
  });

  it("rejects out-of-range numbers", () => {
    expect(parseMapsLink("123.4, 500.1").coords).toBeNull();
  });

  it("treats an address as plain text", () => {
    const r = parseMapsLink("Calle de Tetuán 12, Madrid");
    expect(r).toMatchObject({ coords: null, isUrl: false, isMaps: false });
  });
});

describe("platformOf", () => {
  it.each([
    ["https://www.tiktok.com/@chef/video/123", "TikTok"],
    ["https://vm.tiktok.com/ZMabc/", "TikTok"],
    ["https://www.instagram.com/reel/Cx1/", "Instagram"],
    ["https://youtu.be/abc", "YouTube"],
    ["https://x.com/user/status/1", "X"],
    ["https://pin.it/abc", "Pinterest"],
    ["https://example.com/receta", "Web"],
  ])("%s → %s", (url, name) => expect(platformOf(url)).toBe(name));
});

describe("normUrl", () => {
  it("adds https to bare domains and leaves full URLs alone", () => {
    expect(normUrl("tiktok.com/@a")).toBe("https://tiktok.com/@a");
    expect(normUrl("http://a.com")).toBe("http://a.com");
    expect(normUrl("   ")).toBe("");
  });
});

describe("parseShared", () => {
  it("reads name and address from a Google Maps share", () => {
    const s = parseShared("", "Casa Labra\nC. de Tetuán, 12, Centro, 28013 Madrid\nhttps://maps.app.goo.gl/xyz", "");
    expect(s).toMatchObject({
      name: "Casa Labra",
      addr: "C. de Tetuán, 12, Centro, 28013 Madrid",
      mapsUrl: "https://maps.app.goo.gl/xyz",
      coords: null,
      socials: [],
    });
  });

  it("uses the shared title as name when present", () => {
    const s = parseShared("Casa Labra", "Casa Labra\nC. de Tetuán, 12", "https://maps.app.goo.gl/xyz");
    expect(s.name).toBe("Casa Labra");
    expect(s.addr).toBe("C. de Tetuán, 12");
  });

  it("puts video links in socials and the caption in the description", () => {
    const s = parseShared("", "La mejor tortilla de patatas 🥔 https://vm.tiktok.com/ZM123/", "");
    expect(s.socials).toEqual(["https://vm.tiktok.com/ZM123/"]);
    expect(s.desc).toBe("La mejor tortilla de patatas 🥔");
    expect(s.mapsUrl).toBe("");
  });

  it("does not duplicate a link sent both as text and url", () => {
    const u = "https://www.instagram.com/reel/abc/";
    expect(parseShared("", u, u).socials).toEqual([u]);
  });
});
