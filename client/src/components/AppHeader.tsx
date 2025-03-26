import { CircleDollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";

export function AppHeader() {
  const { user, isLoading, isAuthenticated, signIn, signOut } = useAuth();
  const { toast } = useToast();

  const handleLogin = () => {
    signIn();
  };

  const handleLogout = () => {
    signOut();
  };

  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <div className="flex items-center">
            <CircleDollarSign className="h-8 w-8 text-primary" />
            <h1 className="ml-2 text-2xl font-semibold text-neutral-800">LLM Pricing Setter</h1>
          </div>

          {isLoading ? (
            <Skeleton className="h-10 w-32" />
          ) : isAuthenticated && user ? (
            <div className="flex items-center">
              <span className="mr-4 text-sm text-neutral-500">{user.email}</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user.profile_image_url || undefined} alt={user.username || "User avatar"} />
                      <AvatarFallback>{user.username?.charAt(0) || user.email?.charAt(0) || "U"}</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleLogout}>
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <Button onClick={handleLogin} className="inline-flex items-center">
              <svg
                className="h-5 w-5 mr-2"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 5C13.6569 5 15 6.34315 15 8C15 9.65685 13.6569 11 12 11C10.3431 11 9 9.65685 9 8C9 6.34315 10.3431 5 12 5Z"
                  fill="currentColor"
                />
                <path
                  d="M12 12C9.23858 12 7 14.2386 7 17H17C17 14.2386 14.7614 12 12 12Z"
                  fill="currentColor"
                />
              </svg>
              Log in with Replit
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
