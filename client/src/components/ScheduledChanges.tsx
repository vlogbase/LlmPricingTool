import React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/formatter";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, Check, Calendar, AlertTriangle, Ban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

interface ScheduledChangesProps {
  isAuthorized: boolean;
}

interface ScheduledPrice {
  id: number;
  modelId: string;
  modelName: string;
  provider: string;
  currentPrice: number;
  scheduledPrice: number;
  effectiveDate: string;
  applied: boolean;
}

export function ScheduledChanges({ isAuthorized }: ScheduledChangesProps) {
  const { toast } = useToast();

  const { data: scheduledPrices, isLoading, isError, error } = useQuery<ScheduledPrice[]>({
    queryKey: ['/api/scheduled-prices'],
    enabled: isAuthorized,
  });

  const applyMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/scheduled-prices/${id}/apply`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/scheduled-prices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/model-prices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/price-history'] });
      toast({
        title: "Success",
        description: "Scheduled price change applied successfully!",
        variant: "default",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to apply scheduled price change",
        variant: "destructive",
      });
    }
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/scheduled-prices/${id}/cancel`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/scheduled-prices'] });
      toast({
        title: "Success",
        description: "Scheduled price change cancelled successfully!",
        variant: "default",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel scheduled price change",
        variant: "destructive",
      });
    }
  });

  const handleApply = (id: number) => {
    applyMutation.mutate(id);
  };

  const handleCancel = (id: number) => {
    cancelMutation.mutate(id);
  };

  const isScheduledForToday = (date: string) => {
    const today = new Date();
    const effectiveDate = new Date(date);
    return (
      today.getDate() === effectiveDate.getDate() &&
      today.getMonth() === effectiveDate.getMonth() &&
      today.getFullYear() === effectiveDate.getFullYear()
    );
  };

  const isPast = (date: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to start of day for comparison
    const effectiveDate = new Date(date);
    return effectiveDate < today;
  };

  if (!isAuthorized) {
    return null;
  }

  if (isLoading) {
    return (
      <Card className="bg-white shadow sm:rounded-lg mb-8">
        <CardHeader>
          <CardTitle className="text-lg leading-6 font-medium text-neutral-900">Scheduled Price Changes</CardTitle>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">Price changes scheduled for future application.</p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="border rounded-md p-4">
                <div className="flex justify-between">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-5 w-24" />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="bg-white shadow sm:rounded-lg mb-8">
        <CardHeader>
          <CardTitle>Error Loading Scheduled Changes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-500">{(error as Error)?.message || "Failed to load scheduled changes"}</p>
          <Button 
            className="mt-4" 
            onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/scheduled-prices'] })}
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!scheduledPrices || scheduledPrices.length === 0) {
    return (
      <Card className="bg-white shadow sm:rounded-lg mb-8">
        <CardHeader>
          <CardTitle className="text-lg leading-6 font-medium text-neutral-900">Scheduled Price Changes</CardTitle>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">Price changes scheduled for future application.</p>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-neutral-500">
            <Calendar className="mx-auto h-12 w-12 text-neutral-400" />
            <h3 className="mt-2 text-sm font-medium">No scheduled changes</h3>
            <p className="mt-1 text-sm">There are no price changes scheduled at this time.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white shadow sm:rounded-lg mb-8">
      <CardHeader>
        <CardTitle className="text-lg leading-6 font-medium text-neutral-900">Scheduled Price Changes</CardTitle>
        <p className="mt-1 max-w-2xl text-sm text-neutral-500">Price changes scheduled for future application.</p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col space-y-4">
          {scheduledPrices.map((item) => {
            const isToday = isScheduledForToday(item.effectiveDate);
            const isPastDate = isPast(item.effectiveDate);
            
            return (
              <div 
                key={item.id} 
                className={`border rounded-md p-4 ${isPastDate ? 'bg-amber-50 border-amber-200' : ''}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between">
                  <div className="flex items-center">
                    <h3 className="text-sm font-medium text-neutral-900">{item.modelName}</h3>
                    <span className="ml-2 text-xs text-neutral-500">{item.provider}</span>
                  </div>
                  <div className="flex items-center mt-2 sm:mt-0">
                    <span className="text-sm text-neutral-500 mr-2">
                      Effective: {format(new Date(item.effectiveDate), "MMM d, yyyy")}
                    </span>
                    {isToday && (
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                        Today
                      </Badge>
                    )}
                    {isPastDate && (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Overdue
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-neutral-500">Current Price</p>
                    <p className="text-sm font-medium">{formatCurrency(item.currentPrice)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500">Scheduled Price</p>
                    <p className="text-sm font-medium">{formatCurrency(item.scheduledPrice)}</p>
                  </div>
                  <div className="flex justify-end items-center space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-destructive/10 hover:bg-destructive/20 text-destructive border-destructive/20"
                      onClick={() => handleCancel(item.id)}
                      disabled={cancelMutation.isPending}
                    >
                      {cancelMutation.isPending ? (
                        <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Ban className="h-4 w-4 mr-1" />
                      )}
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleApply(item.id)}
                      disabled={applyMutation.isPending}
                    >
                      {applyMutation.isPending ? (
                        <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4 mr-1" />
                      )}
                      Apply Now
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}