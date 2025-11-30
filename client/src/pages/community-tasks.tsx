import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Users, 
  Plus, 
  ExternalLink, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  MessageSquare,
  Heart,
  Repeat,
  UserPlus,
  Share2,
  Coins,
  Eye,
  Send,
  ChevronUp,
  ChevronDown,
  Globe,
  Sparkles,
  Trophy,
  Star
} from "lucide-react";
import { SiDiscord, SiTelegram, SiX } from "react-icons/si";

interface SocialTask {
  id: string;
  creatorWallet: string;
  platform: string;
  taskType: string;
  title: string;
  description: string | null;
  targetUrl: string;
  targetHandle: string | null;
  rewardLamports: string;
  totalBudgetLamports: string;
  remainingBudgetLamports: string;
  maxCompletions: number;
  completedCount: number;
  status: string;
  createdAt: string;
  expiresAt: string | null;
}

interface SocialTaskSubmission {
  id: string;
  taskId: string;
  workerWallet: string;
  workerHandle: string | null;
  proofUrl: string | null;
  status: string;
  rewardLamports: string;
  submittedAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
}

const platformConfig: Record<string, { icon: JSX.Element; name: string; color: string; bgColor: string }> = {
  x: { 
    icon: <SiX className="w-5 h-5" />, 
    name: "Twitter Task", 
    color: "text-white",
    bgColor: "bg-[#1DA1F2]"
  },
  twitter: { 
    icon: <SiX className="w-5 h-5" />, 
    name: "Twitter Task", 
    color: "text-white",
    bgColor: "bg-[#1DA1F2]"
  },
  discord: { 
    icon: <SiDiscord className="w-5 h-5" />, 
    name: "Discord Task", 
    color: "text-white",
    bgColor: "bg-[#5865F2]"
  },
  telegram: { 
    icon: <SiTelegram className="w-5 h-5" />, 
    name: "Telegram Task", 
    color: "text-white",
    bgColor: "bg-[#0088cc]"
  },
  website: { 
    icon: <Globe className="w-5 h-5" />, 
    name: "Website Task", 
    color: "text-white",
    bgColor: "bg-gradient-to-r from-pink-500 to-purple-500"
  }
};

const taskTypeLabels: Record<string, string> = {
  follow: "Follow",
  like: "Like",
  retweet: "Retweet",
  reply: "Reply",
  quote: "Quote Tweet",
  join: "Join",
  visit: "Visit"
};

const formatLamports = (lamports: string) => {
  const sol = Number(lamports) / 1e9;
  return sol.toFixed(4);
};

const truncateAddress = (address: string) => {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
};

export default function CommunityTasks() {
  const { publicKey, signTransaction, connected } = useWallet();
  const walletAddress = publicKey?.toBase58();
  const { toast } = useToast();
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<SocialTask | null>(null);
  const [proofUrl, setProofUrl] = useState("");
  const [workerHandle, setWorkerHandle] = useState("");
  
  const [expandedPlatforms, setExpandedPlatforms] = useState<Record<string, boolean>>({
    x: true,
    twitter: true,
    discord: true,
    telegram: true,
    website: true
  });
  
  const [newTask, setNewTask] = useState({
    platform: "x",
    taskType: "follow",
    title: "",
    description: "",
    targetUrl: "",
    targetHandle: "",
    rewardSol: "0.001",
    maxCompletions: 10
  });

  const { data: tasksData, isLoading: tasksLoading } = useQuery<{ success: boolean; tasks: SocialTask[] }>({
    queryKey: ['/api/social-tasks'],
    queryFn: async () => {
      const response = await fetch('/api/social-tasks?status=active');
      if (!response.ok) throw new Error('Failed to fetch tasks');
      return response.json();
    }
  });

  const { data: myTasksData, isLoading: myTasksLoading } = useQuery<{ success: boolean; tasks: SocialTask[] }>({
    queryKey: ['/api/social-tasks/creator', walletAddress],
    queryFn: async () => {
      if (!walletAddress) throw new Error('Wallet not connected');
      const response = await fetch(`/api/social-tasks/creator/${walletAddress}`);
      if (!response.ok) throw new Error('Failed to fetch your tasks');
      return response.json();
    },
    enabled: !!walletAddress
  });

  const { data: mySubmissionsData, isLoading: submissionsLoading } = useQuery<{ success: boolean; submissions: SocialTaskSubmission[] }>({
    queryKey: ['/api/social-tasks/worker', walletAddress, 'submissions'],
    queryFn: async () => {
      if (!walletAddress) throw new Error('Wallet not connected');
      const response = await fetch(`/api/social-tasks/worker/${walletAddress}/submissions`);
      if (!response.ok) throw new Error('Failed to fetch submissions');
      return response.json();
    },
    enabled: !!walletAddress
  });

  const createTaskMutation = useMutation({
    mutationFn: async (taskData: typeof newTask) => {
      const rewardLamports = Math.floor(parseFloat(taskData.rewardSol) * 1e9);
      const totalBudget = rewardLamports * taskData.maxCompletions;
      
      const response = await apiRequest('POST', '/api/social-tasks', {
        creatorWallet: walletAddress,
        platform: taskData.platform,
        taskType: taskData.taskType,
        title: taskData.title,
        description: taskData.description,
        targetUrl: taskData.targetUrl,
        targetHandle: taskData.targetHandle,
        rewardLamports,
        totalBudgetLamports: totalBudget,
        maxCompletions: taskData.maxCompletions
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Task created!", description: "Your social task is now live." });
      setCreateDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/social-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/social-tasks/creator', walletAddress] });
      setNewTask({
        platform: "x",
        taskType: "follow",
        title: "",
        description: "",
        targetUrl: "",
        targetHandle: "",
        rewardSol: "0.001",
        maxCompletions: 10
      });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const submitTaskMutation = useMutation({
    mutationFn: async ({ taskId, proofUrl, workerHandle }: { taskId: string; proofUrl: string; workerHandle: string }) => {
      const response = await apiRequest('POST', `/api/social-tasks/${taskId}/submit`, {
        workerWallet: walletAddress,
        workerHandle,
        proofUrl
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Submitted!", description: "Your task completion is pending review." });
      setSubmitDialogOpen(false);
      setProofUrl("");
      setWorkerHandle("");
      queryClient.invalidateQueries({ queryKey: ['/api/social-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/social-tasks/worker', walletAddress] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: "bg-green-600 text-white",
      pending: "bg-yellow-600 text-white",
      approved: "bg-green-600 text-white",
      rejected: "bg-red-600 text-white",
      claimed: "bg-blue-600 text-white",
      completed: "bg-gray-600 text-white",
      paused: "bg-orange-600 text-white"
    };
    return <Badge className={styles[status] || "bg-gray-600"} data-testid={`badge-status-${status}`}>{status}</Badge>;
  };

  const openSubmitDialog = (task: SocialTask) => {
    setSelectedTask(task);
    setSubmitDialogOpen(true);
  };

  const togglePlatform = (platform: string) => {
    setExpandedPlatforms(prev => ({
      ...prev,
      [platform]: !prev[platform]
    }));
  };

  const tasks = tasksData?.tasks || [];
  const myTasks = myTasksData?.tasks || [];
  const mySubmissions = mySubmissionsData?.submissions || [];

  const availableTasks = tasks.filter(t => t.creatorWallet !== walletAddress);
  
  const groupedTasks = useMemo(() => {
    const groups: Record<string, SocialTask[]> = {};
    availableTasks.forEach(task => {
      const platform = task.platform.toLowerCase();
      if (!groups[platform]) groups[platform] = [];
      groups[platform].push(task);
    });
    return groups;
  }, [availableTasks]);

  const totalTasks = availableTasks.length;
  const completedByUser = mySubmissions.filter(s => s.status === 'approved' || s.status === 'claimed').length;

  const totalRewardPool = useMemo(() => {
    return tasks.reduce((sum, task) => sum + Number(task.totalBudgetLamports), 0);
  }, [tasks]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0a] via-[#111111] to-[#0a0a0a] text-white">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-green-400" />
              Task
            </h1>
            <span className="text-sm text-gray-400">*GetFreeSol will verify tasks before distributing rewards</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="bg-gradient-to-br from-purple-900/50 to-indigo-900/50 border-purple-500/30 overflow-hidden" data-testid="card-campaign-featured">
            <div className="relative h-32 bg-gradient-to-r from-purple-600 to-pink-600 flex items-center justify-center">
              <div className="text-center">
                <Trophy className="w-8 h-8 mx-auto mb-2 text-yellow-400" />
                <div className="text-2xl font-bold">{formatLamports(totalRewardPool.toString())} SOL</div>
                <div className="text-sm opacity-80">Total Prize Pool</div>
              </div>
              <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/30 px-2 py-1 rounded-full text-xs">
                <Users className="w-3 h-3" />
                <span>{tasks.length} tasks</span>
              </div>
            </div>
            <CardContent className="pt-4">
              <div className="text-sm text-gray-300">GetFreeSol Community Tasks</div>
              <div className="flex gap-2 mt-2">
                <Badge className="bg-green-500/20 text-green-400 border-green-500/30">+20 EXP</Badge>
                <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">SOL Rewards</Badge>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 border-gray-600/30 flex flex-col justify-center items-center py-8" data-testid="card-create-campaign">
            <Plus className="w-12 h-12 text-gray-500 mb-2" />
            <p className="text-gray-400 text-sm mb-3">Create your own campaign</p>
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button 
                  variant="outline"
                  className="border-purple-500/50 text-purple-400 hover:bg-purple-500/20"
                  disabled={!connected}
                  data-testid="button-create-task"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create Task
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white max-w-md">
                <DialogHeader>
                  <DialogTitle>Create Social Task</DialogTitle>
                  <DialogDescription className="text-gray-400">
                    Create a task for the community to complete and earn rewards
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Platform</Label>
                      <Select value={newTask.platform} onValueChange={(v) => setNewTask({ ...newTask, platform: v })}>
                        <SelectTrigger className="bg-[#2a2a2a] border-gray-600" data-testid="select-platform">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#2a2a2a] border-gray-600">
                          <SelectItem value="x" data-testid="option-platform-x">X (Twitter)</SelectItem>
                          <SelectItem value="discord" data-testid="option-platform-discord">Discord</SelectItem>
                          <SelectItem value="telegram" data-testid="option-platform-telegram">Telegram</SelectItem>
                          <SelectItem value="website" data-testid="option-platform-website">Website</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Task Type</Label>
                      <Select value={newTask.taskType} onValueChange={(v) => setNewTask({ ...newTask, taskType: v })}>
                        <SelectTrigger className="bg-[#2a2a2a] border-gray-600" data-testid="select-tasktype">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#2a2a2a] border-gray-600">
                          <SelectItem value="follow" data-testid="option-type-follow">Follow</SelectItem>
                          <SelectItem value="like" data-testid="option-type-like">Like</SelectItem>
                          <SelectItem value="retweet" data-testid="option-type-retweet">Retweet</SelectItem>
                          <SelectItem value="reply" data-testid="option-type-reply">Reply</SelectItem>
                          <SelectItem value="quote" data-testid="option-type-quote">Quote Tweet</SelectItem>
                          <SelectItem value="join" data-testid="option-type-join">Join Server</SelectItem>
                          <SelectItem value="visit" data-testid="option-type-visit">Visit Page</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div>
                    <Label>Title</Label>
                    <Input 
                      className="bg-[#2a2a2a] border-gray-600"
                      placeholder="e.g., Follow our X account"
                      value={newTask.title}
                      onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                      data-testid="input-title"
                    />
                  </div>
                  
                  <div>
                    <Label>Description (optional)</Label>
                    <Textarea 
                      className="bg-[#2a2a2a] border-gray-600"
                      placeholder="Additional instructions..."
                      value={newTask.description}
                      onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                      data-testid="input-description"
                    />
                  </div>
                  
                  <div>
                    <Label>Target URL</Label>
                    <Input 
                      className="bg-[#2a2a2a] border-gray-600"
                      placeholder="https://x.com/your_account"
                      value={newTask.targetUrl}
                      onChange={(e) => setNewTask({ ...newTask, targetUrl: e.target.value })}
                      data-testid="input-targeturl"
                    />
                  </div>
                  
                  <div>
                    <Label>Target Handle (optional)</Label>
                    <Input 
                      className="bg-[#2a2a2a] border-gray-600"
                      placeholder="@your_handle"
                      value={newTask.targetHandle}
                      onChange={(e) => setNewTask({ ...newTask, targetHandle: e.target.value })}
                      data-testid="input-targethandle"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Reward (SOL)</Label>
                      <Input 
                        type="number"
                        step="0.001"
                        min="0.001"
                        className="bg-[#2a2a2a] border-gray-600"
                        value={newTask.rewardSol}
                        onChange={(e) => setNewTask({ ...newTask, rewardSol: e.target.value })}
                        data-testid="input-reward"
                      />
                    </div>
                    <div>
                      <Label>Max Completions</Label>
                      <Input 
                        type="number"
                        min="1"
                        className="bg-[#2a2a2a] border-gray-600"
                        value={newTask.maxCompletions}
                        onChange={(e) => setNewTask({ ...newTask, maxCompletions: parseInt(e.target.value) || 1 })}
                        data-testid="input-maxcompletions"
                      />
                    </div>
                  </div>
                  
                  <div className="bg-[#2a2a2a] p-3 rounded-lg">
                    <div className="text-sm text-gray-400">Total Budget Required</div>
                    <div className="text-lg font-bold text-yellow-400">
                      {(parseFloat(newTask.rewardSol || "0") * (newTask.maxCompletions || 1)).toFixed(4)} SOL
                    </div>
                  </div>
                </div>
                
                <DialogFooter>
                  <Button 
                    variant="outline" 
                    onClick={() => setCreateDialogOpen(false)}
                    className="border-gray-600 text-gray-300"
                    data-testid="button-cancel-create"
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={() => createTaskMutation.mutate(newTask)}
                    disabled={createTaskMutation.isPending || !newTask.title || !newTask.targetUrl}
                    className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
                    data-testid="button-confirm-create"
                  >
                    {createTaskMutation.isPending ? "Creating..." : "Create Task"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </Card>

          <Card className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 border-gray-600/30 flex flex-col justify-center items-center py-8" data-testid="card-my-progress">
            <Star className="w-10 h-10 text-yellow-400 mb-2" />
            <div className="text-2xl font-bold">{completedByUser}</div>
            <p className="text-gray-400 text-sm">Tasks Completed</p>
            <div className="flex gap-2 mt-3">
              <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">{mySubmissions.filter(s => s.status === 'pending').length} Pending</Badge>
            </div>
          </Card>
        </div>

        <Tabs defaultValue="available" className="w-full">
          <TabsList className="bg-[#1a1a1a] border-gray-700 mb-6">
            <TabsTrigger value="available" className="data-[state=active]:bg-gray-700" data-testid="tab-available">
              Mandatory Tasks
            </TabsTrigger>
            <TabsTrigger value="my-tasks" className="data-[state=active]:bg-gray-700" data-testid="tab-mytasks">
              My Campaigns
            </TabsTrigger>
            <TabsTrigger value="my-submissions" className="data-[state=active]:bg-gray-700" data-testid="tab-mysubmissions">
              My Submissions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="available" className="mt-0">
            {tasksLoading ? (
              <div className="text-center py-12 text-gray-400">Loading tasks...</div>
            ) : availableTasks.length === 0 ? (
              <Card className="bg-[#1a1a1a] border-gray-700">
                <CardContent className="py-12 text-center text-gray-400">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No tasks available right now. Check back later!</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm text-gray-400 mb-4">
                  <span>Mandatory Task</span>
                  <span>({completedByUser}/{totalTasks}) Completed</span>
                </div>

                {Object.entries(groupedTasks).map(([platform, platformTasks]) => {
                  const config = platformConfig[platform] || platformConfig.website;
                  const completedInPlatform = platformTasks.filter(t => 
                    mySubmissions.some(s => s.taskId === t.id && (s.status === 'approved' || s.status === 'claimed'))
                  ).length;

                  return (
                    <Collapsible 
                      key={platform} 
                      open={expandedPlatforms[platform]} 
                      onOpenChange={() => togglePlatform(platform)}
                    >
                      <Card className="bg-[#1a1a1a] border-gray-700 overflow-hidden" data-testid={`card-platform-${platform}`}>
                        <CollapsibleTrigger asChild>
                          <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-800/30 transition-colors" data-testid={`trigger-platform-${platform}`}>
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-full ${config.bgColor} flex items-center justify-center`}>
                                {config.icon}
                              </div>
                              <span className="font-medium">{config.name}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-sm text-gray-400">({completedInPlatform}/{platformTasks.length}) Completed</span>
                              {expandedPlatforms[platform] ? (
                                <ChevronUp className="w-5 h-5 text-gray-400" />
                              ) : (
                                <ChevronDown className="w-5 h-5 text-gray-400" />
                              )}
                            </div>
                          </div>
                        </CollapsibleTrigger>

                        <CollapsibleContent>
                          <div className="border-t border-gray-700">
                            {platformTasks.map((task) => {
                              const userSubmission = mySubmissions.find(s => s.taskId === task.id);
                              const isCompleted = userSubmission && (userSubmission.status === 'approved' || userSubmission.status === 'claimed');
                              const isPending = userSubmission && userSubmission.status === 'pending';

                              return (
                                <div 
                                  key={task.id} 
                                  className="flex items-center justify-between p-4 border-b border-gray-700/50 last:border-b-0 hover:bg-gray-800/20"
                                  data-testid={`task-item-${task.id}`}
                                >
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-gray-300">
                                        {taskTypeLabels[task.taskType] || task.taskType}{" "}
                                        <a 
                                          href={task.targetUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-blue-400 hover:underline"
                                          data-testid={`link-target-${task.id}`}
                                        >
                                          {task.targetHandle || task.title}
                                        </a>
                                        {" "}on {platform === 'x' ? 'Twitter' : platform.charAt(0).toUpperCase() + platform.slice(1)}
                                      </span>
                                    </div>
                                    {task.description && (
                                      <p className="text-sm text-gray-500 mt-1">{task.description}</p>
                                    )}
                                    <div className="flex items-center gap-2 mt-2">
                                      <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">
                                        {formatLamports(task.rewardLamports)} SOL
                                      </Badge>
                                      <span className="text-xs text-gray-500">
                                        {task.completedCount}/{task.maxCompletions} completed
                                      </span>
                                    </div>
                                  </div>
                                  
                                  <div className="ml-4">
                                    {isCompleted ? (
                                      <div className="flex items-center gap-2 text-green-400">
                                        <CheckCircle2 className="w-5 h-5" />
                                        <span className="text-sm">Verified</span>
                                      </div>
                                    ) : isPending ? (
                                      <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                                        Pending
                                      </Badge>
                                    ) : (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="border-gray-600 text-gray-300 hover:bg-gray-700"
                                        disabled={!connected || task.completedCount >= task.maxCompletions}
                                        onClick={() => openSubmitDialog(task)}
                                        data-testid={`button-verify-${task.id}`}
                                      >
                                        Verify
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </CollapsibleContent>
                      </Card>
                    </Collapsible>
                  );
                })}

                <Button 
                  className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-green-400 via-emerald-400 to-teal-400 hover:from-green-500 hover:via-emerald-500 hover:to-teal-500 text-black mt-6"
                  disabled={!connected}
                  data-testid="button-start-earning"
                >
                  Start Earning
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="my-tasks" className="mt-0">
            {!connected ? (
              <Card className="bg-[#1a1a1a] border-gray-700">
                <CardContent className="py-12 text-center text-gray-400">
                  <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Connect your wallet to see your created campaigns</p>
                </CardContent>
              </Card>
            ) : myTasksLoading ? (
              <div className="text-center py-12 text-gray-400">Loading your campaigns...</div>
            ) : myTasks.length === 0 ? (
              <Card className="bg-[#1a1a1a] border-gray-700">
                <CardContent className="py-12 text-center text-gray-400">
                  <Plus className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>You haven't created any campaigns yet.</p>
                  <Button 
                    className="mt-4 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
                    onClick={() => setCreateDialogOpen(true)}
                    data-testid="button-create-first-task"
                  >
                    Create Your First Campaign
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {myTasks.map((task) => {
                  const config = platformConfig[task.platform] || platformConfig.website;
                  
                  return (
                    <Card key={task.id} className="bg-[#1a1a1a] border-gray-700" data-testid={`card-my-task-${task.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full ${config.bgColor} flex items-center justify-center`}>
                              {config.icon}
                            </div>
                            <span className="font-medium">{task.title}</span>
                          </div>
                          {getStatusBadge(task.status)}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-gray-400">Reward</span>
                            <div className="text-yellow-400 font-bold">{formatLamports(task.rewardLamports)} SOL</div>
                          </div>
                          <div>
                            <span className="text-gray-400">Budget Left</span>
                            <div className="text-gray-200">{formatLamports(task.remainingBudgetLamports)} SOL</div>
                          </div>
                          <div>
                            <span className="text-gray-400">Completions</span>
                            <div className="text-gray-200">{task.completedCount} / {task.maxCompletions}</div>
                          </div>
                          <div>
                            <span className="text-gray-400">Created</span>
                            <div className="text-gray-200">{new Date(task.createdAt).toLocaleDateString()}</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="my-submissions" className="mt-0">
            {!connected ? (
              <Card className="bg-[#1a1a1a] border-gray-700">
                <CardContent className="py-12 text-center text-gray-400">
                  <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Connect your wallet to see your submissions</p>
                </CardContent>
              </Card>
            ) : submissionsLoading ? (
              <div className="text-center py-12 text-gray-400">Loading your submissions...</div>
            ) : mySubmissions.length === 0 ? (
              <Card className="bg-[#1a1a1a] border-gray-700">
                <CardContent className="py-12 text-center text-gray-400">
                  <Send className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>You haven't submitted any tasks yet.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {mySubmissions.map((submission) => (
                  <Card key={submission.id} className="bg-[#1a1a1a] border-gray-700" data-testid={`card-submission-${submission.id}`}>
                    <CardContent className="py-4 px-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div>
                            <div className="text-sm text-gray-400">Submitted</div>
                            <div className="text-gray-200">{new Date(submission.submittedAt).toLocaleString()}</div>
                          </div>
                          <div>
                            <div className="text-sm text-gray-400">Reward</div>
                            <div className="text-yellow-400 font-bold">{formatLamports(submission.rewardLamports)} SOL</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {getStatusBadge(submission.status)}
                          {submission.status === 'rejected' && submission.rejectionReason && (
                            <span className="text-sm text-red-400">{submission.rejectionReason}</span>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
          <DialogContent className="bg-[#1a1a1a] border-gray-700 text-white">
            <DialogHeader>
              <DialogTitle>Verify Task Completion</DialogTitle>
              <DialogDescription className="text-gray-400">
                {selectedTask?.title}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div>
                <Label>Your Handle (optional)</Label>
                <Input 
                  className="bg-[#2a2a2a] border-gray-600"
                  placeholder="@your_handle"
                  value={workerHandle}
                  onChange={(e) => setWorkerHandle(e.target.value)}
                  data-testid="input-workerhandle"
                />
              </div>
              
              <div>
                <Label>Proof URL (optional)</Label>
                <Input 
                  className="bg-[#2a2a2a] border-gray-600"
                  placeholder="Link to screenshot or post proving completion"
                  value={proofUrl}
                  onChange={(e) => setProofUrl(e.target.value)}
                  data-testid="input-proofurl"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Providing proof increases approval chances
                </p>
              </div>
              
              {selectedTask && (
                <div className="bg-[#2a2a2a] p-3 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Reward upon approval</span>
                    <span className="text-yellow-400 font-bold">{formatLamports(selectedTask.rewardLamports)} SOL</span>
                  </div>
                </div>
              )}
            </div>
            
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setSubmitDialogOpen(false)}
                className="border-gray-600 text-gray-300"
                data-testid="button-cancel-submit"
              >
                Cancel
              </Button>
              <Button 
                onClick={() => selectedTask && submitTaskMutation.mutate({
                  taskId: selectedTask.id,
                  proofUrl,
                  workerHandle
                })}
                disabled={submitTaskMutation.isPending}
                className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
                data-testid="button-confirm-submit"
              >
                {submitTaskMutation.isPending ? "Verifying..." : "Link & Verify"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
