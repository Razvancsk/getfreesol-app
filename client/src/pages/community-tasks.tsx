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
import { Progress } from "@/components/ui/progress";
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
  Star,
  Gift,
  Zap,
  Target,
  Award,
  TrendingUp
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

const platformConfig: Record<string, { icon: JSX.Element; name: string; color: string; bgColor: string; gradient: string }> = {
  x: { 
    icon: <SiX className="w-5 h-5" />, 
    name: "X (Twitter)", 
    color: "text-white",
    bgColor: "bg-black",
    gradient: "from-gray-800 to-black"
  },
  twitter: { 
    icon: <SiX className="w-5 h-5" />, 
    name: "X (Twitter)", 
    color: "text-white",
    bgColor: "bg-black",
    gradient: "from-gray-800 to-black"
  },
  discord: { 
    icon: <SiDiscord className="w-5 h-5" />, 
    name: "Discord", 
    color: "text-white",
    bgColor: "bg-[#5865F2]",
    gradient: "from-[#7289da] to-[#5865F2]"
  },
  telegram: { 
    icon: <SiTelegram className="w-5 h-5" />, 
    name: "Telegram", 
    color: "text-white",
    bgColor: "bg-[#0088cc]",
    gradient: "from-[#00a0e9] to-[#0088cc]"
  },
  website: { 
    icon: <Globe className="w-5 h-5" />, 
    name: "Website", 
    color: "text-white",
    bgColor: "bg-purple-600",
    gradient: "from-purple-500 to-purple-700"
  }
};

const taskTypeConfig: Record<string, { icon: JSX.Element; label: string }> = {
  follow: { icon: <UserPlus className="w-4 h-4" />, label: "Follow" },
  like: { icon: <Heart className="w-4 h-4" />, label: "Like" },
  retweet: { icon: <Repeat className="w-4 h-4" />, label: "Retweet" },
  reply: { icon: <MessageSquare className="w-4 h-4" />, label: "Reply" },
  quote: { icon: <Share2 className="w-4 h-4" />, label: "Quote Tweet" },
  join: { icon: <Users className="w-4 h-4" />, label: "Join" },
  visit: { icon: <Eye className="w-4 h-4" />, label: "Visit" }
};

const formatLamports = (lamports: string) => {
  const sol = Number(lamports) / 1e9;
  return sol.toFixed(4);
};

const truncateAddress = (address: string) => {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
};

function CampaignCard({ 
  title, 
  description, 
  prizePool, 
  participants, 
  tasks,
  gradient,
  icon,
  onStartClick,
  isActive = true
}: {
  title: string;
  description: string;
  prizePool: string;
  participants: number;
  tasks: number;
  gradient: string;
  icon: JSX.Element;
  onStartClick?: () => void;
  isActive?: boolean;
}) {
  return (
    <Card className={`relative overflow-hidden border-0 ${isActive ? '' : 'opacity-60'}`} data-testid={`card-campaign-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`} />
      <div className="absolute inset-0 bg-black/20" />
      <div className="relative p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
            {icon}
          </div>
          <div className="flex items-center gap-1 bg-black/30 backdrop-blur px-2 py-1 rounded-full text-xs">
            <Users className="w-3 h-3" />
            <span>{participants} joined</span>
          </div>
        </div>
        
        <h3 className="text-lg font-bold mb-1">{title}</h3>
        <p className="text-sm text-white/70 mb-4">{description}</p>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-yellow-300">
              <Trophy className="w-4 h-4" />
              <span className="font-bold">{prizePool} SOL</span>
            </div>
            <Badge variant="outline" className="border-white/30 text-white/80 text-xs">
              {tasks} tasks
            </Badge>
          </div>
          {onStartClick && (
            <Button 
              size="sm" 
              className="bg-white/20 hover:bg-white/30 backdrop-blur border-0"
              onClick={onStartClick}
              data-testid="button-campaign-start"
            >
              Start
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function PlatformTaskGroup({
  platform,
  tasks,
  mySubmissions,
  connected,
  onVerifyClick,
  defaultExpanded = true
}: {
  platform: string;
  tasks: SocialTask[];
  mySubmissions: SocialTaskSubmission[];
  connected: boolean;
  onVerifyClick: (task: SocialTask) => void;
  defaultExpanded?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const config = platformConfig[platform] || platformConfig.website;
  
  const completedTasks = tasks.filter(t => 
    mySubmissions.some(s => s.taskId === t.id && (s.status === 'approved' || s.status === 'claimed'))
  );
  const completedCount = completedTasks.length;
  const totalTasks = tasks.length;
  const progressPercent = totalTasks > 0 ? (completedCount / totalTasks) * 100 : 0;
  
  const totalReward = tasks.reduce((sum, t) => sum + Number(t.rewardLamports), 0);

  return (
    <Card className="bg-[#141414] border-gray-800 overflow-hidden" data-testid={`card-platform-${platform}`}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <div className="p-4 cursor-pointer hover:bg-white/5 transition-colors" data-testid={`trigger-platform-${platform}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${config.gradient} flex items-center justify-center`}>
                  {config.icon}
                </div>
                <div>
                  <h3 className="font-semibold">{config.name}</h3>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span className="text-yellow-400">{formatLamports(totalReward.toString())} SOL</span>
                    <span>•</span>
                    <span>{totalTasks} tasks</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="text-right hidden sm:block">
                  <div className="text-sm">
                    <span className="text-green-400">{completedCount}</span>
                    <span className="text-gray-500">/{totalTasks}</span>
                  </div>
                  <Progress value={progressPercent} className="w-24 h-1.5 bg-gray-700" />
                </div>
                <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center">
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </div>
              </div>
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t border-gray-800">
            {tasks.map((task, index) => {
              const userSubmission = mySubmissions.find(s => s.taskId === task.id);
              const isCompleted = userSubmission && (userSubmission.status === 'approved' || userSubmission.status === 'claimed');
              const isPending = userSubmission && userSubmission.status === 'pending';
              const isRejected = userSubmission && userSubmission.status === 'rejected';
              const taskConfig = taskTypeConfig[task.taskType] || { icon: <Zap className="w-4 h-4" />, label: task.taskType };

              return (
                <div 
                  key={task.id}
                  className={`flex items-center gap-4 p-4 ${index > 0 ? 'border-t border-gray-800/50' : ''} hover:bg-white/[0.02]`}
                  data-testid={`task-item-${task.id}`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    isCompleted ? 'bg-green-500/20 text-green-400' : 
                    isPending ? 'bg-yellow-500/20 text-yellow-400' :
                    isRejected ? 'bg-red-500/20 text-red-400' :
                    'bg-gray-800 text-gray-400'
                  }`}>
                    {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : taskConfig.icon}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-gray-200 text-sm">
                        {taskConfig.label}{" "}
                        <a 
                          href={task.targetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple-400 hover:text-purple-300 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                          data-testid={`link-target-${task.id}`}
                        >
                          {task.targetHandle || task.title}
                        </a>
                      </span>
                      <ExternalLink className="w-3 h-3 text-gray-500" />
                    </div>
                    {task.description && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{task.description}</p>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20 text-xs">
                      +{formatLamports(task.rewardLamports)} SOL
                    </Badge>
                    
                    {isCompleted ? (
                      <div className="flex items-center gap-1.5 text-green-400 text-sm">
                        <CheckCircle2 className="w-4 h-4" />
                        <span className="hidden sm:inline">Done</span>
                      </div>
                    ) : isPending ? (
                      <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">
                        Pending
                      </Badge>
                    ) : isRejected ? (
                      <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">
                        Retry
                      </Badge>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-purple-500/50 text-purple-400 hover:bg-purple-500/20 h-8"
                        disabled={!connected || task.completedCount >= task.maxCompletions}
                        onClick={() => onVerifyClick(task)}
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
          
          {tasks.length > 3 && (
            <div className="p-3 border-t border-gray-800 text-center">
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-gray-400 hover:text-white"
                onClick={() => setIsExpanded(false)}
                data-testid={`button-showless-${platform}`}
              >
                <ChevronUp className="w-4 h-4 mr-1" />
                Show less
              </Button>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export default function CommunityTasks() {
  const { publicKey, signTransaction, connected } = useWallet();
  const walletAddress = publicKey?.toBase58();
  const { toast } = useToast();
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<SocialTask | null>(null);
  const [proofUrl, setProofUrl] = useState("");
  const [workerHandle, setWorkerHandle] = useState("");
  
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
      active: "bg-green-500/20 text-green-400 border-green-500/30",
      pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      approved: "bg-green-500/20 text-green-400 border-green-500/30",
      rejected: "bg-red-500/20 text-red-400 border-red-500/30",
      claimed: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      completed: "bg-gray-500/20 text-gray-400 border-gray-500/30",
      paused: "bg-orange-500/20 text-orange-400 border-orange-500/30"
    };
    return <Badge className={styles[status] || "bg-gray-500/20 text-gray-400"} data-testid={`badge-status-${status}`}>{status}</Badge>;
  };

  const openSubmitDialog = (task: SocialTask) => {
    setSelectedTask(task);
    setSubmitDialogOpen(true);
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
  const pendingCount = mySubmissions.filter(s => s.status === 'pending').length;

  const totalRewardPool = useMemo(() => {
    return tasks.reduce((sum, task) => sum + Number(task.totalBudgetLamports), 0);
  }, [tasks]);

  const platformOrder = ['x', 'twitter', 'discord', 'telegram', 'website'];
  const sortedPlatforms = Object.keys(groupedTasks).sort((a, b) => {
    const aIndex = platformOrder.indexOf(a);
    const bIndex = platformOrder.indexOf(b);
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
  });

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        
        <div className="mb-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Sparkles className="w-7 h-7 text-purple-400" />
                Community Tasks
              </h1>
              <p className="text-gray-400 text-sm mt-1">Complete tasks, earn SOL rewards</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="bg-[#1a1a1a] rounded-lg px-4 py-2 flex items-center gap-2">
                <Trophy className="w-4 h-4 text-yellow-400" />
                <span className="text-sm">
                  <span className="text-yellow-400 font-bold">{formatLamports(totalRewardPool.toString())}</span>
                  <span className="text-gray-400"> SOL Pool</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <CampaignCard
            title="GetFreeSol Campaign"
            description="Complete social tasks and earn SOL"
            prizePool={formatLamports(totalRewardPool.toString())}
            participants={tasks.reduce((sum, t) => sum + t.completedCount, 0)}
            tasks={totalTasks}
            gradient="from-purple-600 via-purple-700 to-indigo-800"
            icon={<Gift className="w-6 h-6 text-white" />}
          />
          
          <Card className="bg-gradient-to-br from-[#1a1a1a] to-[#111] border-gray-800 flex flex-col justify-center items-center p-6" data-testid="card-create-campaign">
            <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center mb-3">
              <Plus className="w-6 h-6 text-purple-400" />
            </div>
            <p className="text-gray-400 text-sm mb-4 text-center">Create your own task campaign</p>
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

          <Card className="bg-gradient-to-br from-[#1a1a1a] to-[#111] border-gray-800 p-6" data-testid="card-my-progress">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                <Award className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <div className="text-sm text-gray-400">Your Progress</div>
                <div className="text-xl font-bold">
                  <span className="text-green-400">{completedByUser}</span>
                  <span className="text-gray-500">/{totalTasks}</span>
                </div>
              </div>
            </div>
            <Progress value={totalTasks > 0 ? (completedByUser / totalTasks) * 100 : 0} className="h-2 bg-gray-800 mb-3" />
            <div className="flex gap-2">
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">{completedByUser} Done</Badge>
              <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">{pendingCount} Pending</Badge>
            </div>
          </Card>
        </div>

        <Tabs defaultValue="available" className="w-full">
          <TabsList className="bg-[#141414] border border-gray-800 mb-6 p-1">
            <TabsTrigger 
              value="available" 
              className="data-[state=active]:bg-purple-600 data-[state=active]:text-white" 
              data-testid="tab-available"
            >
              <Target className="w-4 h-4 mr-2" />
              Available Tasks
            </TabsTrigger>
            <TabsTrigger 
              value="my-tasks" 
              className="data-[state=active]:bg-purple-600 data-[state=active]:text-white" 
              data-testid="tab-mytasks"
            >
              <TrendingUp className="w-4 h-4 mr-2" />
              My Campaigns
            </TabsTrigger>
            <TabsTrigger 
              value="my-submissions" 
              className="data-[state=active]:bg-purple-600 data-[state=active]:text-white" 
              data-testid="tab-mysubmissions"
            >
              <Send className="w-4 h-4 mr-2" />
              Submissions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="available" className="mt-0">
            {tasksLoading ? (
              <div className="text-center py-12 text-gray-400">
                <div className="animate-pulse">Loading tasks...</div>
              </div>
            ) : availableTasks.length === 0 ? (
              <Card className="bg-[#141414] border-gray-800">
                <CardContent className="py-12 text-center text-gray-400">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No tasks available right now. Check back later!</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm text-gray-400 px-1">
                  <span>Complete tasks to earn rewards</span>
                  <span className="text-green-400">{completedByUser}/{totalTasks} completed</span>
                </div>

                {sortedPlatforms.map((platform) => (
                  <PlatformTaskGroup
                    key={platform}
                    platform={platform}
                    tasks={groupedTasks[platform]}
                    mySubmissions={mySubmissions}
                    connected={connected}
                    onVerifyClick={openSubmitDialog}
                  />
                ))}

                <Button 
                  className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-green-400 via-emerald-500 to-teal-500 hover:from-green-500 hover:via-emerald-600 hover:to-teal-600 text-black mt-6 shadow-lg shadow-green-500/20"
                  disabled={!connected}
                  data-testid="button-start-earning"
                >
                  <Coins className="w-5 h-5 mr-2" />
                  Start Earning SOL
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="my-tasks" className="mt-0">
            {!connected ? (
              <Card className="bg-[#141414] border-gray-800">
                <CardContent className="py-12 text-center text-gray-400">
                  <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Connect your wallet to see your created campaigns</p>
                </CardContent>
              </Card>
            ) : myTasksLoading ? (
              <div className="text-center py-12 text-gray-400">Loading your campaigns...</div>
            ) : myTasks.length === 0 ? (
              <Card className="bg-[#141414] border-gray-800">
                <CardContent className="py-12 text-center text-gray-400">
                  <Plus className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>You haven't created any campaigns yet.</p>
                  <Button 
                    className="mt-4 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600"
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
                  const progressPercent = task.maxCompletions > 0 ? (task.completedCount / task.maxCompletions) * 100 : 0;
                  
                  return (
                    <Card key={task.id} className="bg-[#141414] border-gray-800" data-testid={`card-my-task-${task.id}`}>
                      <CardContent className="p-5">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${config.gradient} flex items-center justify-center`}>
                              {config.icon}
                            </div>
                            <div>
                              <span className="font-medium">{task.title}</span>
                              <div className="text-sm text-gray-400">{config.name}</div>
                            </div>
                          </div>
                          {getStatusBadge(task.status)}
                        </div>
                        
                        <div className="mb-3">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-400">Progress</span>
                            <span className="text-gray-300">{task.completedCount}/{task.maxCompletions}</span>
                          </div>
                          <Progress value={progressPercent} className="h-2 bg-gray-800" />
                        </div>
                        
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <span className="text-gray-500">Reward</span>
                            <div className="text-yellow-400 font-bold">{formatLamports(task.rewardLamports)} SOL</div>
                          </div>
                          <div>
                            <span className="text-gray-500">Budget Left</span>
                            <div className="text-gray-200">{formatLamports(task.remainingBudgetLamports)} SOL</div>
                          </div>
                          <div>
                            <span className="text-gray-500">Created</span>
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
              <Card className="bg-[#141414] border-gray-800">
                <CardContent className="py-12 text-center text-gray-400">
                  <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Connect your wallet to see your submissions</p>
                </CardContent>
              </Card>
            ) : submissionsLoading ? (
              <div className="text-center py-12 text-gray-400">Loading your submissions...</div>
            ) : mySubmissions.length === 0 ? (
              <Card className="bg-[#141414] border-gray-800">
                <CardContent className="py-12 text-center text-gray-400">
                  <Send className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>You haven't submitted any tasks yet.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {mySubmissions.map((submission) => (
                  <Card key={submission.id} className="bg-[#141414] border-gray-800" data-testid={`card-submission-${submission.id}`}>
                    <CardContent className="py-4 px-5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            submission.status === 'approved' || submission.status === 'claimed' ? 'bg-green-500/20 text-green-400' :
                            submission.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-red-500/20 text-red-400'
                          }`}>
                            {submission.status === 'approved' || submission.status === 'claimed' ? (
                              <CheckCircle2 className="w-5 h-5" />
                            ) : submission.status === 'pending' ? (
                              <Clock className="w-5 h-5" />
                            ) : (
                              <XCircle className="w-5 h-5" />
                            )}
                          </div>
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
                            <span className="text-sm text-red-400 max-w-[200px] truncate">{submission.rejectionReason}</span>
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
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
                Verify Task Completion
              </DialogTitle>
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
                <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 p-4 rounded-lg border border-green-500/30">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-300">Reward upon approval</span>
                    <span className="text-green-400 font-bold text-lg">{formatLamports(selectedTask.rewardLamports)} SOL</span>
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
