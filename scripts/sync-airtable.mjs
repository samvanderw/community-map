// Pulls the "Community Map Export" view from the Cities table in Airtable
// and writes it to data/cities.json for the static map page to fetch.
//
// Required env vars:
//   AIRTABLE_TOKEN     Personal Access Token with data.records:read on the base
// Optional env vars (defaults point at the FaithTech CITIES base):
//   AIRTABLE_BASE_ID
//   AIRTABLE_CITIES_TABLE_ID
//   AIRTABLE_COUNTRIES_TABLE_ID
//   AIRTABLE_VIEW_NAME

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = process.env.AIRTABLE_BASE_ID || "appejBxuSyYajO9Vk";
const CITIES_TABLE_ID = process.env.AIRTABLE_CITIES_TABLE_ID || "tblqSfBiBmB7fZaNd";
const COUNTRIES_TABLE_ID = process.env.AIRTABLE_COUNTRIES_TABLE_ID || "tblvbKHdC8gC7TsMT";
const VIEW_NAME = process.env.AIRTABLE_VIEW_NAME || "Community Map Export";

if (!AIRTABLE_TOKEN) {
  console.error("Missing AIRTABLE_TOKEN environment variable.");
  process.exit(1);
}

async function fetchAllRecords(tableId, { view, fields } = {}) {
  const records = [];
  let offset;

  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${tableId}`);
    if (view) url.searchParams.set("view", view);
    if (fields) fields.forEach(f => url.searchParams.append("fields[]", f));
    if (offset) url.searchParams.set("offset", offset);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
    });

    if (!res.ok) {
      throw new Error(`Airtable API error ${res.status} on ${tableId}: ${await res.text()}`);
    }

    const data = await res.json();
    records.push(...data.records);
    offset = data.offset;
  } while (offset);

  return records;
}

async function main() {
  const [countryRecords, cityRecords] = await Promise.all([
    fetchAllRecords(COUNTRIES_TABLE_ID, { fields: ["Name"] }),
    fetchAllRecords(CITIES_TABLE_ID, {
      view: VIEW_NAME,
      fields: ["Name", "Latitude", "Longitude", "Country", "Map Status"]
    })
  ]);

  const countryNameById = new Map(countryRecords.map(r => [r.id, r.fields.Name]));

  const cities = cityRecords
    .map(r => {
      const countryIds = r.fields.Country || [];
      return {
        Name: r.fields.Name || "",
        Latitude: r.fields.Latitude,
        Longitude: r.fields.Longitude,
        Country: countryIds.map(id => countryNameById.get(id) || "").filter(Boolean).join(", "),
        "Map Status": r.fields["Map Status"] || ""
      };
    })
    .filter(c => typeof c.Latitude === "number" && typeof c.Longitude === "number");

  const output = {
    generatedAt: new Date().toISOString(),
    cities
  };

  const fs = await import("node:fs/promises");
  await fs.mkdir("data", { recursive: true });
  await fs.writeFile("data/cities.json", JSON.stringify(output, null, 2) + "\n");

  console.log(`Wrote ${cities.length} cities to data/cities.json`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
