import express, { Request, Response } from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import { usersRouter } from "./routes/users.js";

const app = express();

const allowedOrigin = process.env.CLIENT_URL || "http://localhost:5173";

app.options("/{*path}", cors({ origin: allowedOrigin }));
app.use(cors({ origin: allowedOrigin }));
app.use(express.json());
app.use(clerkMiddleware());

app.get("/health", (req: Request, res: Response) => {
    res.json({ status: "ok" });
});

app.use("/users", usersRouter);

export { app };
