export default function handler(_req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.status(200).json({
    status: "ok",
    model: "safemind-hybrid-security-v2",
    scan_types: ["message", "link", "email", "phone"]
  });
}
