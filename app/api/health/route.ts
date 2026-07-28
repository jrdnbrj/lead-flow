export function GET() {
  return Response.json({ success: true, data: { service: "leadflow", status: "ok" } });
}
