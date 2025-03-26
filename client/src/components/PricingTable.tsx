import React, { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/formatter";
import { useToast } from "@/hooks/use-toast";
import { ModelPrice } from "@shared/schema";
import { RefreshCw, ChevronDown, ChevronUp, Brain, ArrowDownUp } from "lucide-react";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";

interface PricingTableProps {
  canEdit: boolean;
}

type SortOption = 
  | "default" 
  | "columnA-asc" 
  | "columnA-desc" 
  | "columnC-asc" 
  | "columnC-desc";

export function PricingTable({ canEdit }: PricingTableProps) {
  const { toast } = useToast();
  const [editedPrices, setEditedPrices] = useState<Record<string, number>>({});
  const [sortOption, setSortOption] = useState<SortOption>("default");
  
  const { data: modelsData, isLoading, isError, error } = useQuery<ModelPrice[]>({
    queryKey: ['/api/model-prices'],
  });
  
  // Sort models based on selected sort option
  const sortedModels = React.useMemo(() => {
    if (!modelsData) return [];
    
    const models = [...modelsData];
    
    switch (sortOption) {
      case "columnA-asc":
        return models.sort((a, b) => a.openRouterPrice - b.openRouterPrice);
      case "columnA-desc":
        return models.sort((a, b) => b.openRouterPrice - a.openRouterPrice);
      case "columnC-asc":
        return models.sort((a, b) => a.actualPrice - b.actualPrice);
      case "columnC-desc":
        return models.sort((a, b) => b.actualPrice - a.actualPrice);
      default:
        return models; // Default order (as returned from API)
    }
  }, [modelsData, sortOption]);

  const refreshMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/refresh-prices', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/model-prices'] });
      toast({
        title: "Success",
        description: "Prices refreshed from OpenRouter!",
        variant: "default",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to refresh prices",
        variant: "destructive",
      });
    }
  });

  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, number>) => {
      return apiRequest('POST', '/api/update-prices', { actualPrices: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/model-prices'] });
      setEditedPrices({});
      toast({
        title: "Success",
        description: "Changes saved successfully!",
        variant: "default",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save changes",
        variant: "destructive",
      });
    }
  });

  const handlePriceChange = (modelId: string, value: string) => {
    const numericValue = parseFloat(value.replace(/[$,]/g, ''));
    if (!isNaN(numericValue)) {
      setEditedPrices({
        ...editedPrices,
        [modelId]: numericValue,
      });
    }
  };

  const saveChanges = () => {
    saveMutation.mutate(editedPrices);
  };

  const hasChanges = Object.keys(editedPrices).length > 0;

  if (isLoading) {
    return (
      <Card className="bg-white shadow overflow-hidden sm:rounded-lg mb-8">
        <CardHeader className="px-4 py-5 sm:px-6 flex justify-between">
          <div>
            <CardTitle className="text-lg leading-6 font-medium text-neutral-900">LLM Pricing Table</CardTitle>
            <p className="mt-1 max-w-2xl text-sm text-neutral-500">All prices shown in USD per million tokens.</p>
          </div>
          <Skeleton className="h-9 w-32" />
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Model</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Column A<br/><span className="font-normal normal-case">OpenRouter Price</span></th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Column B<br/><span className="font-normal normal-case">Suggested Price</span></th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Column C<br/><span className="font-normal normal-case">Actual Price</span></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-neutral-200">
                {[1, 2, 3, 4].map((i) => (
                  <tr key={i}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Skeleton className="h-10 w-10 rounded-md" />
                        <div className="ml-4">
                          <Skeleton className="h-5 w-24" />
                          <Skeleton className="h-4 w-16 mt-1" />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Skeleton className="h-5 w-16" />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Skeleton className="h-5 w-16" />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Skeleton className="h-8 w-24" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
        <CardFooter className="px-4 py-3 bg-neutral-50 border-t border-neutral-200 sm:px-6 flex justify-end">
          <Skeleton className="h-9 w-32" />
        </CardFooter>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="bg-white shadow overflow-hidden sm:rounded-lg mb-8">
        <CardHeader>
          <CardTitle>Error Loading Pricing Data</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-500">{(error as Error)?.message || "Failed to load pricing data"}</p>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/model-prices'] })}>
            Retry
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="bg-white shadow overflow-hidden sm:rounded-lg mb-8">
      <CardHeader className="px-4 py-5 sm:px-6 flex flex-col sm:flex-row sm:items-center">
        <div className="flex-1">
          <CardTitle className="text-lg leading-6 font-medium text-neutral-900">LLM Pricing Table</CardTitle>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">All prices shown in USD per million tokens.</p>
        </div>
        <div className="flex items-center space-x-2 mt-4 sm:mt-0">
          {canEdit && (
            <div className="mr-2">
              <Select value={sortOption} onValueChange={(value) => setSortOption(value as SortOption)}>
                <SelectTrigger className="h-9 w-[180px]">
                  <SelectValue placeholder="Sort By" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default Order</SelectItem>
                  <SelectItem value="columnA-asc">Column A (Low to High)</SelectItem>
                  <SelectItem value="columnA-desc">Column A (High to Low)</SelectItem>
                  <SelectItem value="columnC-asc">Column C (Low to High)</SelectItem>
                  <SelectItem value="columnC-desc">Column C (High to Low)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            className="text-primary-700 bg-primary-light hover:bg-primary-light"
          >
            {refreshMutation.isPending ? (
              <>
                <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                Refreshing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh Prices
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Model</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider cursor-pointer" onClick={() => setSortOption(sortOption === "columnA-asc" ? "columnA-desc" : "columnA-asc")}>
                  Column A
                  {sortOption === "columnA-asc" && <ChevronUp className="inline h-4 w-4 ml-1" />}
                  {sortOption === "columnA-desc" && <ChevronDown className="inline h-4 w-4 ml-1" />}
                  {sortOption !== "columnA-asc" && sortOption !== "columnA-desc" && <ArrowDownUp className="inline h-4 w-4 ml-1 opacity-30" />}
                  <br/><span className="font-normal normal-case">OpenRouter Price</span>
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Column B<br/><span className="font-normal normal-case">Suggested Price</span></th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider cursor-pointer" onClick={() => setSortOption(sortOption === "columnC-asc" ? "columnC-desc" : "columnC-asc")}>
                  Column C
                  {sortOption === "columnC-asc" && <ChevronUp className="inline h-4 w-4 ml-1" />}
                  {sortOption === "columnC-desc" && <ChevronDown className="inline h-4 w-4 ml-1" />}
                  {sortOption !== "columnC-asc" && sortOption !== "columnC-desc" && <ArrowDownUp className="inline h-4 w-4 ml-1 opacity-30" />}
                  <br/><span className="font-normal normal-case">Actual Price</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-neutral-200">
              {sortedModels.map((model) => (
                <tr key={model.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10 flex items-center justify-center bg-primary-light rounded-md">
                        <Brain className="h-6 w-6 text-primary" />
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-neutral-900">{model.name}</div>
                        <div className="text-sm text-neutral-500">{model.provider}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-neutral-900">{formatCurrency(model.openRouterPrice)}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-neutral-900">{formatCurrency(model.suggestedPrice)}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                    {canEdit ? (
                      <div
                        contentEditable={canEdit}
                        suppressContentEditableWarning={true}
                        onBlur={(e) => handlePriceChange(model.id, e.currentTarget.textContent || '')}
                        className="editable px-2 py-1 rounded bg-primary-50 border-b border-dashed border-primary"
                      >
                        {formatCurrency(editedPrices[model.id] ?? model.actualPrice)}
                      </div>
                    ) : (
                      <div className="px-2 py-1">{formatCurrency(model.actualPrice)}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
      <CardFooter className="px-4 py-3 bg-neutral-50 border-t border-neutral-200 sm:px-6 flex justify-end">
        <Button 
          onClick={saveChanges} 
          disabled={!canEdit || !hasChanges || saveMutation.isPending}
          className="bg-secondary hover:bg-secondary-hover"
        >
          {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </CardFooter>
    </Card>
  );
}
