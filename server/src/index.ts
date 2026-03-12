import { User } from "@slippi-dashboard/shared";
import express, { Request, Response } from "express";

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req: Request, res: Response) => {
    const testUser: User = {
        id: '1',
        clerk_id: 'abc',
        created_at: new Date().toISOString()
    };
    res.send(testUser);
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});