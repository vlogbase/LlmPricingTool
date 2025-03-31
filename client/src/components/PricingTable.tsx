import React, { useState, useEffect, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/formatter";
import { useToast } from "@/hooks/use-toast";
import { ModelPrice, PriceSettingsDTO } from "@shared/schema";
import { RefreshCw, ChevronDown, ChevronUp, Brain, ArrowDownUp, Save, Calculator } from "lucide-react";
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
  const [newPrices, setNewPrices] = useState<Record<string, number>>({});
  const [sortOption, setSortOption] = useState<SortOption>("default");
  const [percentageMarkup, setPercentageMarkup] = useState<number>(25);
  const [flatFeeMarkup, setFlatFeeMarkup] = useState<number>(0.2);
  const [activeTab, setActiveTab] = useState<string>("current");
  
  const { data: modelsData, isLoading, isError, error } = useQuery<ModelPrice[]>({
    queryKey: ['/api/model-prices'],
  });
  
  // Get price settings (only if canEdit is true)
  const { 
    data: priceSettings,
    isLoading: isLoadingSettings
  } = useQuery<PriceSettingsDTO>({
    queryKey: ['/api/price-settings'],
    enabled: canEdit,
  });
  
  // Initialize the markup values when settings are loaded
  useEffect(() => {
    if (priceSettings) {
      setPercentageMarkup(priceSettings.percentageMarkup);
      setFlatFeeMarkup(priceSettings.flatFeeMarkup);
    }
  }, [priceSettings]);
  
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
      return apiRequest('/api/refresh-prices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
      });
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
      return apiRequest('/api/update-prices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ actualPrices: data })
      });
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

  // Update markup settings
  const updateSettingsMutation = useMutation({
    mutationFn: async (data: { percentageMarkup?: number, flatFeeMarkup?: number }) => {
      return apiRequest('/api/price-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/price-settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/model-prices'] });
      toast({
        title: "Success",
        description: "Markup settings updated successfully!",
        variant: "default",
      });
      // Reset the new prices
      setNewPrices({});
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update markup settings",
        variant: "destructive",
      });
    }
  });
  
  // Calculate new prices based on current markup settings
  const calculateNewPrices = useCallback(() => {
    if (!modelsData) return;
    
    const newPricesObj: Record<string, number> = {};
    
    modelsData.forEach(model => {
      // Calculate the new price using the current markup settings
      const newPrice = (model.openRouterPrice * (1 + percentageMarkup / 100)) + flatFeeMarkup;
      newPricesObj[model.id] = newPrice;
    });
    
    setNewPrices(newPricesObj);
  }, [modelsData, percentageMarkup, flatFeeMarkup]);
  
  // Apply new prices
  const applyNewPricesMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/update-prices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ actualPrices: newPrices })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/model-prices'] });
      setNewPrices({});
      toast({
        title: "Success",
        description: "New prices applied successfully!",
        variant: "default",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to apply new prices",
        variant: "destructive",
      });
    }
  });
  
  // Handle markup settings changes
  const handlePercentageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value >= 0) {
      setPercentageMarkup(value);
    }
  };
  
  const handleFlatFeeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value >= 0) {
      setFlatFeeMarkup(value);
    }
  };
  
  const saveSettings = () => {
    updateSettingsMutation.mutate({ 
      percentageMarkup, 
      flatFeeMarkup 
    });
  };
  
  const applyNewPrices = () => {
    applyNewPricesMutation.mutate();
  };
  
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
  
  // Effect to recalculate new prices when markup settings change
  useEffect(() => {
    if (activeTab === "new") {
      calculateNewPrices();
    }
  }, [percentageMarkup, flatFeeMarkup, activeTab, calculateNewPrices]);

  const hasChanges = Object.keys(editedPrices).length > 0;
  const hasNewPrices = Object.keys(newPrices).length > 0;

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
    <>
      {/* Admin Settings Panel (only shown to admin users) */}
      {canEdit && (
        <Card className="bg-white shadow overflow-hidden sm:rounded-lg mb-4">
          <CardHeader>
            <CardTitle className="text-lg leading-6 font-medium text-neutral-900">Markup Settings</CardTitle>
            <p className="mt-1 max-w-2xl text-sm text-neutral-500">
              Configure the markup values used to calculate suggested prices.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="percentageMarkup">Percentage Markup (%)</Label>
                <div className="flex mt-2">
                  <Input
                    id="percentageMarkup"
                    type="number"
                    min="0"
                    step="0.1"
                    value={percentageMarkup}
                    onChange={handlePercentageChange}
                    className="mr-2"
                  />
                  <span className="flex items-center text-neutral-500">%</span>
                </div>
                <p className="text-sm text-neutral-500 mt-1">
                  Add this percentage to OpenRouter prices.
                </p>
              </div>
              <div>
                <Label htmlFor="flatFeeMarkup">Flat Fee Markup ($ per million tokens)</Label>
                <div className="flex mt-2">
                  <span className="flex items-center text-neutral-500 mr-2">$</span>
                  <Input
                    id="flatFeeMarkup"
                    type="number"
                    min="0"
                    step="0.01"
                    value={flatFeeMarkup}
                    onChange={handleFlatFeeChange}
                  />
                </div>
                <p className="text-sm text-neutral-500 mt-1">
                  Add this fixed amount to every price.
                </p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="justify-end space-x-2 bg-neutral-50 border-t border-neutral-200">
            <Button
              onClick={saveSettings}
              disabled={updateSettingsMutation.isPending || isLoadingSettings}
              className="bg-primary"
            >
              {updateSettingsMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-1" />
                  Save Settings
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      )}
    
      {/* Pricing Table */}
      <Card className="bg-white shadow overflow-hidden sm:rounded-lg mb-8">
        <CardHeader className="px-4 py-5 sm:px-6 flex flex-col sm:flex-row sm:items-center border-b">
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
        
        {canEdit && (
          <div className="px-4 py-2 bg-neutral-50 border-b border-neutral-200">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full sm:w-[400px] grid-cols-2">
                <TabsTrigger value="current">Current Prices</TabsTrigger>
                <TabsTrigger value="new">New Prices</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        )}
        
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
                    <br/>
                    <span className="font-normal normal-case">
                      {activeTab === "new" && canEdit ? "New Price" : "Actual Price"}
                    </span>
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
                      <div className="text-sm text-neutral-900">
                        {activeTab === "new" && canEdit 
                          ? formatCurrency((model.openRouterPrice * (1 + percentageMarkup / 100)) + flatFeeMarkup)
                          : formatCurrency(model.suggestedPrice)
                        }
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                      {canEdit && activeTab === "current" ? (
                        <div
                          contentEditable={true}
                          suppressContentEditableWarning={true}
                          onBlur={(e) => handlePriceChange(model.id, e.currentTarget.textContent || '')}
                          className="editable px-2 py-1 rounded bg-primary-50 border-b border-dashed border-primary"
                        >
                          {formatCurrency(editedPrices[model.id] ?? model.actualPrice)}
                        </div>
                      ) : canEdit && activeTab === "new" ? (
                        <div className="px-2 py-1 bg-green-50 text-green-700 rounded">
                          {formatCurrency(newPrices[model.id] || 
                            ((model.openRouterPrice * (1 + percentageMarkup / 100)) + flatFeeMarkup))}
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
        <CardFooter className="px-4 py-3 bg-neutral-50 border-t border-neutral-200 sm:px-6 flex justify-between">
          {canEdit && activeTab === "new" && (
            <div className="text-sm text-neutral-500">
              <Calculator className="inline h-4 w-4 mr-1" />
              Formula: OpenRouter Price × (1 + {percentageMarkup}%) + ${flatFeeMarkup.toFixed(2)}
            </div>
          )}
          <div>
            {canEdit && activeTab === "current" && (
              <Button 
                onClick={saveChanges} 
                disabled={!hasChanges || saveMutation.isPending}
                className="bg-secondary hover:bg-secondary-hover"
              >
                {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            )}
            {canEdit && activeTab === "new" && (
              <Button 
                onClick={applyNewPrices}
                disabled={applyNewPricesMutation.isPending}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {applyNewPricesMutation.isPending ? 'Applying...' : 'Apply New Prices'}
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>
    </>
  );
}
