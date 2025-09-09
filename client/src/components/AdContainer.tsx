import { useQuery } from "@tanstack/react-query";
import AdCard from "./AdCard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

interface Ad {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  targetUrl: string;
  appName: string;
  placement: string;
  priority: number;
  isActive: boolean;
  clickCount: number;
  impressionCount: number;
  createdAt: string;
  updatedAt: string;
}

interface AdContainerProps {
  placement: string;
  maxAds?: number;
  className?: string;
  title?: string;
}

export default function AdContainer({ 
  placement, 
  maxAds = 3, 
  className = "", 
  title = "Sponsored"
}: AdContainerProps) {
  const { data: adsData, isLoading, error } = useQuery({
    queryKey: ["/api/ads", placement],
    queryFn: () => fetch(`/api/ads?placement=${placement}`).then(res => res.json()),
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  if (isLoading) {
    return (
      <div className={`space-y-3 ${className}`} data-testid={`ad-container-loading-${placement}`}>
        <h4 className="text-sm font-medium text-gray-400">{title}</h4>
        {Array.from({ length: Math.min(maxAds, 2) }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (error || !adsData?.success) {
    return null; // Fail silently for ads
  }

  const ads: Ad[] = adsData.ads || [];
  const displayAds = ads.slice(0, maxAds);

  if (displayAds.length === 0) {
    return null; // Don't show anything if no ads
  }

  return (
    <div className={`space-y-3 ${className}`} data-testid={`ad-container-${placement}`}>
      <h4 className="text-sm font-medium text-gray-400" data-testid={`ad-title-${placement}`}>
        {title}
      </h4>
      
      <div className="space-y-2">
        {displayAds.map((ad) => (
          <AdCard 
            key={ad.id} 
            ad={ad} 
            className="w-full"
          />
        ))}
      </div>
      
      {displayAds.length > 0 && (
        <p className="text-xs text-gray-500 text-center" data-testid={`ad-disclaimer-${placement}`}>
          DeFi opportunities • Earn with referrals
        </p>
      )}
    </div>
  );
}