"use client";

import { useUser } from "@clerk/nextjs";

export const useClientAuthData = () => {
  const { user, isLoaded, isSignedIn } = useUser();

  return {
    userId: user?.id ?? null,
    user,
    isLoaded,
    isSignedIn,
  };
};
