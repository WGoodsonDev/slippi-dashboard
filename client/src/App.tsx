import { useAuth, SignInButton, UserButton } from "@clerk/react";
import { useEffect } from "react";

function App() {
    const { isSignedIn, getToken } = useAuth();

    useEffect(() => {
        if (!isSignedIn) return;

        async function syncUser() {
            const token = await getToken();
            const response = await fetch(`${import.meta.env.VITE_API_URL}/users/sync`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                }
            });

            if (!response.ok) {
                console.error("Failed to sync user:", response.status);
            }
        }

        syncUser().catch((error) => {
            console.error("Failed to sync user:", error);
        });
    }, [isSignedIn]);

    return (
        <main>
            {isSignedIn ? <UserButton /> : <SignInButton />}
        </main>
    );
}

export default App;
