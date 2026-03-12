import { User } from "@slippi-dashboard/shared";
import express, { Request, Response } from "express";

const app = express();

app.get('/', (req: Request, res: Response) => {
    const testUser: User = {
        id: '1',
        clerk_id: 'abc',
        created_at: new Date().toISOString()
    };
    res.send(testUser);
});

app.get('/health', (req: Request, res: Response) => {
    res.json({ status: "ok" });
});

export { app };