import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check, KeyRound, RefreshCw } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface APIInformationProps {
  apiEndpoint: string;
  isLoading: boolean;
  isAuthorized: boolean;
}

export function APIInformation({ apiEndpoint, isLoading, isAuthorized }: APIInformationProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  // Fetch API key if authorized
  const {
    data: apiKeyData,
    isLoading: isLoadingApiKey,
    error: apiKeyError
  } = useQuery({
    queryKey: ['/api/generate-api-key'],
    enabled: isAuthorized, // Only fetch if user is authorized
    retry: false,
    queryFn: async () => {
      try {
        // Use the correct typing for apiRequest
        const response = await apiRequest<{apiKey: string}>('/api/generate-api-key', {
          method: 'POST',
          body: JSON.stringify({ description: 'Auto-generated API key' }),
          headers: { 'Content-Type': 'application/json' }
        });
        return response;
      } catch (error) {
        console.error('Error fetching API key:', error);
        return null;
      }
    }
  });

  // Mutation to generate a new API key
  const generateKeyMutation = useMutation({
    mutationFn: async () => {
      // Use the correct typing for apiRequest
      const response = await apiRequest<{apiKey: string}>('/api/generate-api-key', {
        method: 'POST',
        body: JSON.stringify({ description: 'Generated API key' }),
        headers: { 'Content-Type': 'application/json' }
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/generate-api-key'] });
      toast({
        title: "Success",
        description: "New API key generated successfully!",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate new API key",
        variant: "destructive",
      });
    }
  });

  const copyToClipboard = async (text: string, isKey = false) => {
    try {
      await navigator.clipboard.writeText(text);
      if (isKey) {
        setCopiedKey(true);
        setTimeout(() => setCopiedKey(false), 2000);
      } else {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
      toast({
        title: "Success",
        description: `${isKey ? "API key" : "API endpoint"} copied to clipboard!`,
      });
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const exampleResponse = `{
  "data": [
    {
      "id": "gpt-4",
      "name": "GPT-4",
      "pricing": {
        "input": "0.000060000",
        "completion": "0.000060000"
      },
      "context_length": 8192,
      "creator": "OpenAI"
    },
    {
      "id": "gpt-3.5-turbo",
      "name": "GPT-3.5 Turbo",
      "pricing": {
        "input": "0.000001500",
        "completion": "0.000001500"
      },
      "context_length": 8192,
      "creator": "OpenAI"
    }
  ]
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
                  onClick={() => copyToClipboard(apiEndpoint)} 
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
          
          {isAuthorized && (
            <div className="mt-6">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-neutral-900">Your API Key</h4>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => generateKeyMutation.mutate()}
                  disabled={generateKeyMutation.isPending}
                  className="text-xs"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Generate New Key
                </Button>
              </div>
              
              <div className="mt-2 flex">
                <div className="flex-1 rounded-l-md border border-r-0 border-neutral-300 bg-neutral-50 p-2 relative">
                  {isLoadingApiKey || !apiKeyData?.apiKey ? (
                    <Skeleton className="h-6 w-full" />
                  ) : (
                    <div className="font-mono text-xs text-neutral-900 overflow-x-auto whitespace-nowrap">
                      {apiKeyData.apiKey}
                    </div>
                  )}
                </div>
                <Button 
                  onClick={() => apiKeyData?.apiKey && copyToClipboard(apiKeyData.apiKey, true)} 
                  disabled={isLoadingApiKey || !apiKeyData?.apiKey}
                  className="rounded-l-none"
                >
                  {copiedKey ? (
                    <Check className="h-4 w-4 mr-1" />
                  ) : (
                    <Copy className="h-4 w-4 mr-1" />
                  )}
                  {copiedKey ? "Copied" : "Copy"}
                </Button>
              </div>
              
              <p className="mt-2 text-xs text-neutral-500">
                <KeyRound className="h-3 w-3 inline mr-1" />
                This API key has full access to the pricing API. Keep it secure!
              </p>
            </div>
          )}
          
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
