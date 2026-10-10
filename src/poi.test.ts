import { describe, expect, it } from "vitest";
import { makeItem } from "./items";
import { findSaved, hoursEs, kindOf, parseOverpass, poiFromNominatim, prefillFromPoi, type Poi } from "./poi";

const labra: Poi = {
  id: "node/1",
  name: "Casa Labra",
  lat: 40.4176,
  lng: -3.7053,
  tags: {
    name: "Casa Labra",
    amenity: "restaurant",
    cuisine: "spanish;tapas",
    outdoor_seating: "yes",
    "addr:street": "Calle de Tetuán",
    "addr:housenumber": "12",
    "addr:city": "Madrid",
    opening_hours: "Mo-Sa 11:00-15:30,18:00-23:30; Su off",
    phone: "+34 915 31 00 81",
    website: "https://www.casalabra.es",
  },
};

describe("parseOverpass", () => {
  it("keeps named places, using the centre for buildings", () => {
    const pois = parseOverpass({
      elements: [
        { type: "node", id: 1, lat: 40.1, lon: -3.1, tags: { name: "Bar Uno", amenity: "bar" } },
        { type: "way", id: 2, center: { lat: 40.2, lon: -3.2 }, tags: { name: "Museo", tourism: "museum" } },
        { type: "node", id: 3, lat: 40.3, lon: -3.3, tags: { amenity: "cafe" } },
      ],
    });
    expect(pois.map((p) => [p.id, p.name, p.lat])).toEqual([
      ["node/1", "Bar Uno", 40.1],
      ["way/2", "Museo", 40.2],
    ]);
  });
});

describe("kindOf", () => {
  it.each([
    [{ amenity: "cafe" }, "Cafetería", "comer"],
    [{ tourism: "museum" }, "Museo", "ver"],
    [{ amenity: "cinema" }, "Cine", "ocio"],
    [{ historic: "castle" }, "Castillo", "ver"],
    [{ shop: "bakery" }, "Panadería", "comer"],
    [{ office: "company" }, "Lugar", "varios"],
  ])("%o → %s", (tags, label, cat) => expect(kindOf(tags as Record<string, string>)).toEqual({ label, cat }));
});

describe("prefillFromPoi", () => {
  it("fills everything the map knows", () => {
    expect(prefillFromPoi(labra)).toEqual({
      cat: "comer",
      name: "Casa Labra",
      addr: "Calle de Tetuán, 12, Madrid",
      coords: { lat: 40.4176, lng: -3.7053 },
      tags: ["española", "tapas", "terraza"],
      info: { website: "https://www.casalabra.es", phone: "+34 915 31 00 81", hours: "Mo-Sa 11:00-15:30,18:00-23:30; Su off", osmId: "node/1" },
    });
  });
});

describe("hoursEs", () => {
  it("translates days to Spanish", () => {
    expect(hoursEs("Mo-Sa 11:00-15:30,18:00-23:30; Su off")).toBe("Lu-Sá 11:00-15:30,18:00-23:30; Do cerrado");
    expect(hoursEs("24/7")).toBe("Abierto 24 horas");
  });
});

describe("poiFromNominatim", () => {
  it("builds a place with its kind and address from a search result", () => {
    const p = poiFromNominatim({
      osm_type: "node",
      osm_id: 99,
      lat: "40.4138",
      lon: "-3.6921",
      name: "Museo del Prado",
      display_name: "Museo del Prado, Calle de Ruiz de Alarcón, Madrid",
      category: "tourism",
      type: "museum",
      extratags: { website: "https://www.museodelprado.es" },
      address: { road: "Calle de Ruiz de Alarcón", house_number: "23", city: "Madrid" },
    });
    expect(p.id).toBe("node/99");
    expect(kindOf(p.tags).cat).toBe("ver");
    expect(prefillFromPoi(p)).toMatchObject({ addr: "Calle de Ruiz de Alarcón, 23, Madrid", info: { website: "https://www.museodelprado.es" } });
  });
});

describe("findSaved", () => {
  it("recognises a saved place by map id or by name and distance", () => {
    const byId = makeItem({ name: "Otro nombre", cat: "comer", info: { website: "", phone: "", hours: "", osmId: "node/1" } });
    expect(findSaved([byId], labra)).toBe(byId);

    const byName = makeItem({ name: "casa  labra", cat: "comer", lat: 40.4177, lng: -3.7054 });
    expect(findSaved([byName], labra)).toBe(byName);

    const farAway = makeItem({ name: "Casa Labra", cat: "comer", lat: 40.43, lng: -3.70 });
    expect(findSaved([farAway], labra)).toBeUndefined();
  });
});
