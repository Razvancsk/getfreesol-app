import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

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

interface AdCardProps {
  ad: Ad;
  className?: string;
}

export default function AdCard({ ad, className = "" }: AdCardProps) {
  const [impressionTracked, setImpressionTracked] = useState(false);

  // Track impression when component mounts
  useEffect(() => {
    if (!impressionTracked) {
      trackImpression();
      setImpressionTracked(true);
    }
  }, [impressionTracked]);

  const trackImpression = async () => {
    try {
      await apiRequest("POST", `/api/ads/${ad.id}/impression`);
    } catch (error) {
      console.error("Failed to track ad impression:", error);
    }
  };

  const handleClick = async () => {
    try {
      // Track click
      await apiRequest("POST", `/api/ads/${ad.id}/click`);
      
      // Open referral link in new tab
      window.open(ad.targetUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error("Failed to track ad click:", error);
      // Still open the link even if tracking fails
      window.open(ad.targetUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <Card 
      className={`cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-105 bg-gradient-to-r from-purple-600/10 to-blue-600/10 border-purple-400/30 ${className}`}
      onClick={handleClick}
      data-testid={`ad-card-${ad.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start space-x-3">
          {ad.imageUrl && (
            <img 
              src={ad.imageUrl} 
              alt={ad.appName} 
              className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
              data-testid={`ad-image-${ad.id}`}
            />
          )}
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-white text-sm truncate" data-testid={`ad-title-${ad.id}`}>
                {ad.title}
              </h3>
              <ExternalLink className="h-4 w-4 text-purple-400 flex-shrink-0" />
            </div>
            
            <p className="text-gray-300 text-xs mb-2 line-clamp-2" data-testid={`ad-description-${ad.id}`}>
              {ad.description}
            </p>
            
            <div className="flex items-center justify-between">
              <Badge 
                variant="outline" 
                className="text-xs bg-purple-500/20 text-purple-300 border-purple-400/30"
                data-testid={`ad-badge-${ad.id}`}
              >
                {ad.appName}
              </Badge>
              
              <span className="text-xs text-gray-400" data-testid={`ad-clicks-${ad.id}`}>
                {ad.clickCount} clicks
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}