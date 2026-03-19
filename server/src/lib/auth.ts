import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";

function requireApiAuth(req: Request, res: Response, next: NextFunction): void {
    if (!getAuth(req).userId) {
        res.status(401).json({ error: "Unauthenticated" });
        return;
    }
    next();
}

export { requireApiAuth };