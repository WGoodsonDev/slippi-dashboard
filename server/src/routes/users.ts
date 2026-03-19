import { Router, Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { prisma } from "../lib/prisma.js";
import { requireApiAuth } from "../lib/auth.js";

const usersRouter = Router();

usersRouter.post("/sync", requireApiAuth, async (req: Request, res: Response) => {
    const clerkUserId = getAuth(req).userId as string;

    try {
        const user = await prisma.user.upsert({
            where: { clerkId: clerkUserId },
            create: { clerkId: clerkUserId },
            update: {},
        });

        res.status(200).json(user);
    } catch (error) {
        console.error("Failed to upsert user on sync:", error);
        res.status(500).json({ error: "Failed to sync user"});
    }
});

export { usersRouter };