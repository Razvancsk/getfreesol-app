import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Trash2, Plus, ExternalLink, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Link } from 'wouter';

interface Ad {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  targetUrl: string;
  placement: 'sidebar' | 'mobile' | 'both';
  isActive: boolean;
  clicks: number;
  impressions: number;
  createdAt: string;
}

interface CreateAdRequest {
  title: string;
  description: string;
  imageUrl: string;
  targetUrl: string;
  placement: 'sidebar' | 'mobile' | 'both';
  isActive: boolean;
}

export default function AdminPage() {
  const { toast } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState<CreateAdRequest>({
    title: '',
    description: '',
    imageUrl: '',
    targetUrl: '',
    placement: 'sidebar',
    isActive: true,
  });

  // Fetch all ads
  const { data: ads = [], isLoading } = useQuery<Ad[]>({
    queryKey: ['/api/ads', 'all'],
  });

  // Create ad mutation
  const createAdMutation = useMutation({
    mutationFn: (data: CreateAdRequest) => 
      apiRequest('/api/ads', 'POST', data),
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Ad created successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/ads'] });
      setFormData({
        title: '',
        description: '',
        imageUrl: '',
        targetUrl: '',
        placement: 'sidebar',
        isActive: true,
      });
      setShowAddForm(false);
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create ad',
        variant: 'destructive',
      });
    },
  });

  // Update ad mutation
  const updateAdMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Ad> }) =>
      apiRequest(`/api/ads/${id}`, 'PATCH', data),
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Ad updated successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/ads'] });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update ad',
        variant: 'destructive',
      });
    },
  });

  // Delete ad mutation
  const deleteAdMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/ads/${id}`, 'DELETE'),
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Ad deleted successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/ads'] });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete ad',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.targetUrl.trim()) {
      toast({
        title: 'Error',
        description: 'Title and target URL are required',
        variant: 'destructive',
      });
      return;
    }
    createAdMutation.mutate(formData);
  };

  const toggleAdStatus = (id: string, isActive: boolean) => {
    updateAdMutation.mutate({ id, data: { isActive } });
  };

  const deleteAd = (id: string) => {
    if (confirm('Are you sure you want to delete this ad?')) {
      deleteAdMutation.mutate(id);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      <div className="container mx-auto px-4 pt-8 pb-2 max-w-6xl">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-8 space-y-4 lg:space-y-0">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Ad Management</h1>
            <p className="text-purple-300">Manage your DeFi advertising links and referrals</p>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="outline" className="border-purple-500/50 text-purple-300 hover:bg-purple-500/20">
                ← Back to App
              </Button>
            </Link>
            <Button 
              onClick={() => setShowAddForm(!showAddForm)}
              className="bg-purple-600 hover:bg-purple-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add New Ad
            </Button>
          </div>
        </div>

        {/* Add New Ad Form */}
        {showAddForm && (
          <Card className="bg-black/40 backdrop-blur-sm border border-purple-500/30 mb-8">
            <CardHeader>
              <CardTitle className="text-white">Create New Ad</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="title" className="text-purple-300">Title *</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                      className="bg-slate-800/50 border-purple-500/30 text-white"
                      placeholder="e.g., Jupiter DEX - Best Solana Trading"
                      required
                      data-testid="input-ad-title"
                    />
                  </div>
                  <div>
                    <Label htmlFor="targetUrl" className="text-purple-300">Target URL *</Label>
                    <Input
                      id="targetUrl"
                      type="url"
                      value={formData.targetUrl}
                      onChange={(e) => setFormData(prev => ({ ...prev, targetUrl: e.target.value }))}
                      className="bg-slate-800/50 border-purple-500/30 text-white"
                      placeholder="https://jup.ag?referrer=your-code"
                      required
                      data-testid="input-ad-url"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="description" className="text-purple-300">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    className="bg-slate-800/50 border-purple-500/30 text-white"
                    placeholder="Trade Solana tokens with the best rates and low fees"
                    rows={3}
                    data-testid="input-ad-description"
                  />
                </div>

                <div>
                  <Label htmlFor="imageUrl" className="text-purple-300">Image URL</Label>
                  <Input
                    id="imageUrl"
                    type="url"
                    value={formData.imageUrl}
                    onChange={(e) => setFormData(prev => ({ ...prev, imageUrl: e.target.value }))}
                    className="bg-slate-800/50 border-purple-500/30 text-white"
                    placeholder="https://example.com/logo.png"
                    data-testid="input-ad-image"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="placement" className="text-purple-300">Placement</Label>
                    <Select 
                      value={formData.placement} 
                      onValueChange={(value: 'sidebar' | 'mobile' | 'both') => 
                        setFormData(prev => ({ ...prev, placement: value }))
                      }
                    >
                      <SelectTrigger className="bg-slate-800/50 border-purple-500/30 text-white" data-testid="select-ad-placement">
                        <SelectValue placeholder="Select placement" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sidebar">Desktop Sidebar Only</SelectItem>
                        <SelectItem value="mobile">Mobile Only</SelectItem>
                        <SelectItem value="both">Both Desktop & Mobile</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center space-x-2 pt-6">
                    <Switch
                      id="isActive"
                      checked={formData.isActive}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: checked }))}
                      data-testid="switch-ad-active"
                    />
                    <Label htmlFor="isActive" className="text-purple-300">Active</Label>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button 
                    type="submit" 
                    className="bg-purple-600 hover:bg-purple-700"
                    disabled={createAdMutation.isPending}
                    data-testid="button-create-ad"
                  >
                    {createAdMutation.isPending ? 'Creating...' : 'Create Ad'}
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setShowAddForm(false)}
                    className="border-purple-500/50 text-purple-300 hover:bg-purple-500/20"
                    data-testid="button-cancel-ad"
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Ads List */}
        <div className="space-y-4">
          {isLoading ? (
            <Card className="bg-black/40 backdrop-blur-sm border border-purple-500/30">
              <CardContent className="p-8 text-center">
                <p className="text-purple-300">Loading ads...</p>
              </CardContent>
            </Card>
          ) : ads.length === 0 ? (
            <Card className="bg-black/40 backdrop-blur-sm border border-purple-500/30">
              <CardContent className="p-8 text-center">
                <h3 className="text-xl font-semibold text-white mb-2">No ads yet</h3>
                <p className="text-purple-300 mb-4">Create your first ad to start monetizing your DeFi traffic</p>
                <Button 
                  onClick={() => setShowAddForm(true)}
                  className="bg-purple-600 hover:bg-purple-700"
                  data-testid="button-create-first-ad"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Ad
                </Button>
              </CardContent>
            </Card>
          ) : (
            ads.map((ad) => (
              <Card key={ad.id} className="bg-black/40 backdrop-blur-sm border border-purple-500/30">
                <CardContent className="p-6">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-white">{ad.title}</h3>
                        <span className={`px-2 py-1 rounded text-xs ${
                          ad.isActive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                          {ad.isActive ? 'Active' : 'Inactive'}
                        </span>
                        <span className="px-2 py-1 rounded text-xs bg-purple-500/20 text-purple-400 capitalize">
                          {ad.placement === 'both' ? 'Desktop & Mobile' : ad.placement}
                        </span>
                      </div>
                      {ad.description && (
                        <p className="text-purple-300 text-sm">{ad.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-sm text-purple-400">
                        <span className="flex items-center gap-1">
                          <Eye className="h-3 w-3" />
                          {ad.impressions} views
                        </span>
                        <span className="flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" />
                          {ad.clicks} clicks
                        </span>
                        {ad.clicks > 0 && ad.impressions > 0 && (
                          <span className="text-green-400">
                            {((ad.clicks / ad.impressions) * 100).toFixed(1)}% CTR
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-purple-500 font-mono break-all">
                        {ad.targetUrl}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={ad.isActive}
                        onCheckedChange={(checked) => toggleAdStatus(ad.id, checked)}
                        disabled={updateAdMutation.isPending}
                        data-testid={`switch-ad-status-${ad.id}`}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(ad.targetUrl, '_blank')}
                        className="border-purple-500/50 text-purple-300 hover:bg-purple-500/20"
                        data-testid={`button-visit-${ad.id}`}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteAd(ad.id)}
                        className="border-red-500/50 text-red-400 hover:bg-red-500/20"
                        disabled={deleteAdMutation.isPending}
                        data-testid={`button-delete-${ad.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Usage Instructions */}
        <Card className="bg-black/40 backdrop-blur-sm border border-purple-500/30 mt-8">
          <CardHeader>
            <CardTitle className="text-white">How to Use</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-purple-300">
            <p><strong className="text-white">1. Add referral links:</strong> Include your referral codes in the target URLs</p>
            <p><strong className="text-white">2. Choose placement:</strong> Sidebar shows on desktop, mobile shows on smaller screens</p>
            <p><strong className="text-white">3. Track performance:</strong> Monitor clicks and impressions to optimize your ads</p>
            <p><strong className="text-white">4. Examples:</strong></p>
            <ul className="list-disc list-inside ml-4 space-y-1 text-sm">
              <li>Jupiter: https://jup.ag?referrer=YOUR_CODE</li>
              <li>Raydium: https://raydium.io/swap/?partner=YOUR_CODE</li>
              <li>Orca: https://www.orca.so?ref=YOUR_CODE</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}