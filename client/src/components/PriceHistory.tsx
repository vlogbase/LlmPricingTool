import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatCurrency } from '@/lib/formatter';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

// Define model interface
interface Model {
  id: string;
  name: string;
  provider: string;
  openRouterPrice: number;
  suggestedPrice: number;
  actualPrice: number;
  lastUpdated: string;
}

// Define the PriceHistory type to match the server response
interface PriceHistory {
  id: number;
  modelId: string;
  modelName: string;
  provider: string;
  previousPrice: number;
  newPrice: number;
  changedAt: string;
  changeSource: string;
}

interface PriceHistoryProps {
  isAuthorized: boolean;
}

export function PriceHistory({ isAuthorized }: PriceHistoryProps) {
  const [selectedModel, setSelectedModel] = useState<string>('all');
  
  // Fetch all models for the filter dropdown
  const { data: models = [], isLoading: isModelsLoading } = useQuery<Model[]>({
    queryKey: ['/api/model-prices'],
    enabled: isAuthorized,
  });
  
  // Fetch all price history or model-specific history based on selection
  const historyQueryKey = selectedModel === 'all' 
    ? ['/api/price-history'] 
    : [`/api/price-history/model/${selectedModel}`];
  
  const { data: history = [], isLoading: isHistoryLoading } = useQuery<PriceHistory[]>({
    queryKey: historyQueryKey,
    enabled: isAuthorized,
  });
  
  // Format the date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Get a badge color based on the change source
  const getSourceBadgeVariant = (source: string) => {
    const sources: Record<string, "default" | "outline" | "secondary" | "destructive"> = {
      'manual': 'destructive',
      'scheduled': 'secondary',
      'openrouter_import': 'outline',
      'initial_creation': 'default',
    };
    return sources[source] || 'default';
  };

  if (!isAuthorized) {
    return null;
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Price Change History</CardTitle>
        <CardDescription>
          Track all price changes for LLM models
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <Select
            value={selectedModel}
            onValueChange={setSelectedModel}
            disabled={isModelsLoading}
          >
            <SelectTrigger className="w-full md:w-[300px]">
              <SelectValue placeholder="Select a model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Models</SelectItem>
              {models?.map((model: Model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.name} ({model.provider})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        {isHistoryLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : history?.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No price change history available
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Previous Price</TableHead>
                  <TableHead>New Price</TableHead>
                  <TableHead>Change</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history?.map((item: PriceHistory) => {
                  const priceDifference = item.newPrice - item.previousPrice;
                  const percentChange = item.previousPrice === 0 
                    ? 'N/A' 
                    : `${((priceDifference / item.previousPrice) * 100).toFixed(2)}%`;
                  
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {formatDate(item.changedAt)}
                      </TableCell>
                      <TableCell>
                        {item.modelName}
                        <div className="text-xs text-muted-foreground">{item.provider}</div>
                      </TableCell>
                      <TableCell>
                        {formatCurrency(item.previousPrice)}
                      </TableCell>
                      <TableCell>
                        {formatCurrency(item.newPrice)}
                      </TableCell>
                      <TableCell>
                        <span className={priceDifference >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {priceDifference >= 0 ? '+' : ''}
                          {formatCurrency(priceDifference)} ({percentChange})
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getSourceBadgeVariant(item.changeSource)}>
                          {item.changeSource.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}