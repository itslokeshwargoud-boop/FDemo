import type { NextApiRequest, NextApiResponse } from "next";

// Auth removed — this route is a no-op stub so the build doesn't break.
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({ message: "Auth disabled" });
}
