import { AppHeader } from "@/components/AppHeader";
import { AuthenticationBanner } from "@/components/AuthenticationBanner";
import { PricingTable } from "@/components/PricingTable";
import { APIInformation } from "@/components/APIInformation";
import { PriceHistory } from "@/components/PriceHistory";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";

export default function Home() {
  const { user, isLoading: authLoading } = useAuth();
  
  interface EndpointInfo {
    endpoint: string;
  }
  
  const { data: apiEndpoint = { endpoint: "https://example.com/api/llm-pricing" }, isLoading: endpointLoading } = useQuery<EndpointInfo>({
    queryKey: ['/api/endpoint-info'],
    enabled: !authLoading,
  });

  const isAuthorized = user?.email === "andy@sentigral.com";

  return (
    <div className="bg-gray-50 min-h-screen">
      <AppHeader />
      
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <AuthenticationBanner 
          isAuthenticated={!!user} 
          userEmail={user?.email}
          isAuthorized={isAuthorized}
        />
        
        <PricingTable canEdit={isAuthorized} />
        
        <APIInformation 
          apiEndpoint={apiEndpoint.endpoint} 
          isLoading={endpointLoading}
          isAuthorized={isAuthorized}
        />
        
        {isAuthorized && (
          <div className="mt-6">
            <PriceHistory isAuthorized={isAuthorized} />
          </div>
        )}
      </main>

      <footer className="bg-white">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <div className="border-t border-neutral-200 pt-4">
            <p className="text-sm text-neutral-500 text-center">
              &copy; {new Date().getFullYear()} LLM Pricing Setter. All prices in USD per million tokens.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
