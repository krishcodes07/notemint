import clientPromise from "@/lib/db";

export async function GET() {
  const client = await clientPromise;
  const db = client.db("notemint");

  const users = db.collection("users");

  await users.insertOne({ message: "MongoDB connected!" });

  return Response.json({ success: true });
}
