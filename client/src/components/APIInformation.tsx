import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check } from "lucide-react";

interface APIInformationProps {
  apiEndpoint: string;
  isLoading: boolean;
}

export function APIInformation({ apiEndpoint, isLoading }: APIInformationProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(apiEndpoint);
      setCopied(true);
      toast({
        title: "Success",
        description: "API endpoint copied to clipboard!",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const exampleResponse = `{
  "models": [
    {
      "id": "gpt-4",
      "name": "GPT-4",
      "provider": "OpenAI",
      "price_per_million_tokens": 37.70
    },
    {
      "id": "gpt-3.5-turbo",
      "name": "GPT-3.5 Turbo",
      "provider": "OpenAI",
      "price_per_million_tokens": 1.20
    },
    {
      "id": "claude-2",
      "name": "Claude 2",
      "provider": "Anthropic",
      "price_per_million_tokens": 10.20
    }
  ],
  "last_updated": "${new Date().toISOString()}"
}`;

  return (
    <Card className="bg-white shadow sm:rounded-lg mb-8">
      <CardHeader className="px-4 py-5 sm:p-6">
        <CardTitle className="text-lg leading-6 font-medium text-neutral-900">
          API Access
        </CardTitle>
        <div className="mt-2 max-w-xl text-sm text-neutral-500">
          <p>
            Access the pricing data via our API endpoint. Use this information to integrate with your other applications.
          </p>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-5 sm:px-6">
        <div className="mt-5">
          <div className="rounded-md bg-neutral-50 p-4 border border-neutral-200">
            <div className="flex">
              <div className="flex-1">
                <h4 className="text-sm font-medium text-neutral-900">Endpoint URL</h4>
                <div className="mt-1 flex rounded-md shadow-sm">
                  <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-neutral-300 bg-neutral-50 text-neutral-500 text-sm">
                    GET
                  </span>
                  {isLoading ? (
                    <Skeleton className="flex-1 h-9 rounded-r-md" />
                  ) : (
                    <input 
                      type="text" 
                      readOnly 
                      value={apiEndpoint} 
                      className="focus:ring-primary focus:border-primary flex-1 block w-full rounded-none rounded-r-md sm:text-sm border-neutral-300 bg-neutral-100 p-2" 
                    />
                  )}
                </div>
              </div>
              <div className="ml-3">
                <Button 
                  onClick={copyToClipboard} 
                  disabled={isLoading}
                  className="inline-flex items-center px-3 py-2 border border-transparent shadow-sm text-sm leading-4 font-medium rounded-md text-white bg-primary hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                >
                  {copied ? (
                    <Check className="h-4 w-4 mr-1" />
                  ) : (
                    <Copy className="h-4 w-4 mr-1" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          </div>
          
          <div className="mt-6">
            <h4 className="text-sm font-medium text-neutral-900">Example Response</h4>
            <div className="mt-2 bg-neutral-800 rounded-md">
              <pre className="text-xs text-neutral-200 p-4 overflow-x-auto">
                {exampleResponse}
              </pre>
            </div>
          </div>
          
          <div className="mt-6">
            <h4 className="text-sm font-medium text-neutral-900">Authentication</h4>
            <p className="mt-2 text-sm text-neutral-500">
              API requests require authentication with an API key passed in the header.
            </p>
            <div className="mt-2 bg-neutral-50 p-4 rounded-md border border-neutral-200">
              <p className="text-xs font-mono text-neutral-700">
                Authorization: Bearer YOUR_API_KEY
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
