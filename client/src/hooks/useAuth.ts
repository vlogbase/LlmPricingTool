import { useQuery } from "@tanstack/react-query";

interface ReplitUser {
  email: string;
  username: string;
  id: string;
  profile_image_url: string;
}

export function useAuth() {
  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const signIn = async () => {
    window.location.href = "/api/login";
  };

  const signOut = async () => {
    window.location.href = "/api/logout";
  };

  return {
    user: user as ReplitUser | null,
    isLoading,
    isAuthenticated: !!user,
    signIn,
    signOut,
  };
}
