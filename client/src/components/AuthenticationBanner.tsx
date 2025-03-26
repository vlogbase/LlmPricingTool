import { AlertTriangle, CheckCircle } from "lucide-react";

interface AuthenticationBannerProps {
  isAuthenticated: boolean;
  userEmail?: string | null;
  isAuthorized: boolean;
}

export function AuthenticationBanner({ isAuthenticated, userEmail, isAuthorized }: AuthenticationBannerProps) {
  if (!isAuthenticated) {
    return (
      <div className="mb-6 p-4 rounded-md bg-yellow-50">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <AlertTriangle className="h-5 w-5 text-warning" />
          </div>
          <div className="ml-3 flex-1 md:flex md:justify-between">
            <p className="text-sm text-neutral-700">
              You need to log in as <span className="font-medium">andy@sentigral.com</span> to edit pricing.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 p-4 rounded-md bg-green-50">
      <div className="flex items-center">
        <div className="flex-shrink-0">
          <CheckCircle className="h-5 w-5 text-secondary" />
        </div>
        <div className="ml-3 flex-1 md:flex md:justify-between">
          <p className="text-sm text-neutral-700">
            You are logged in as <span className="font-medium">{userEmail}</span>.
            {isAuthorized ? (
              " You have permission to edit pricing."
            ) : (
              " You do not have permission to edit pricing."
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
