import express, { Request, Response } from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import { usersRouter } from "./routes/users.js";

const app = express();

app.options("/{*path}", cors());
app.use(cors());
app.use(express.json());
app.use(clerkMiddleware());

app.get("/health", (req: Request, res: Response) => {
    res.json({ status: "ok" });
});

app.use("/users", usersRouter);

export { app };
