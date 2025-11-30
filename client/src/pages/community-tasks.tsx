import { useState } from "react";
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
  Twitter,
  MessageSquare,
  Heart,
  Repeat,
  UserPlus,
  Share2,
  Coins,
  Eye,
  Send
} from "lucide-react";
import { SiDiscord } from "react-icons/si";

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

const platformIcons: Record<string, JSX.Element> = {
  twitter: <Twitter className="w-4 h-4" />,
  x: <Twitter className="w-4 h-4" />,
  discord: <SiDiscord className="w-4 h-4" />
};

const taskTypeIcons: Record<string, JSX.Element> = {
  follow: <UserPlus className="w-4 h-4" />,
  like: <Heart className="w-4 h-4" />,
  retweet: <Repeat className="w-4 h-4" />,
  reply: <MessageSquare className="w-4 h-4" />,
  quote: <Share2 className="w-4 h-4" />,
  join: <Users className="w-4 h-4" />
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
      
      const response = await apiRequest('/api/social-tasks', {
        method: 'POST',
        body: JSON.stringify({
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
        })
      });
      return response;
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
      const response = await apiRequest(`/api/social-tasks/${taskId}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          workerWallet: walletAddress,
          workerHandle,
          proofUrl
        })
      });
      return response;
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
    return <Badge className={styles[status] || "bg-gray-600"}>{status}</Badge>;
  };

  const openSubmitDialog = (task: SocialTask) => {
    setSelectedTask(task);
    setSubmitDialogOpen(true);
  };

  const tasks = tasksData?.tasks || [];
  const myTasks = myTasksData?.tasks || [];
  const mySubmissions = mySubmissionsData?.submissions || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900 text-white">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2 flex items-center justify-center gap-2">
            <Users className="w-8 h-8 text-purple-300" />
            Community Tasks
          </h1>
          <p className="text-purple-200">Complete social tasks to earn SOL or create tasks to grow your presence</p>
        </div>

        <div className="flex justify-end mb-6">
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                className="bg-purple-600 hover:bg-purple-700"
                disabled={!connected}
                data-testid="button-create-task"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Task
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-purple-900 border-purple-600 text-white max-w-md">
              <DialogHeader>
                <DialogTitle>Create Social Task</DialogTitle>
                <DialogDescription className="text-purple-200">
                  Create a task for the community to complete and earn rewards
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Platform</Label>
                    <Select value={newTask.platform} onValueChange={(v) => setNewTask({ ...newTask, platform: v })}>
                      <SelectTrigger className="bg-purple-800 border-purple-600">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-purple-800 border-purple-600">
                        <SelectItem value="x">X (Twitter)</SelectItem>
                        <SelectItem value="discord">Discord</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Task Type</Label>
                    <Select value={newTask.taskType} onValueChange={(v) => setNewTask({ ...newTask, taskType: v })}>
                      <SelectTrigger className="bg-purple-800 border-purple-600">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-purple-800 border-purple-600">
                        <SelectItem value="follow">Follow</SelectItem>
                        <SelectItem value="like">Like</SelectItem>
                        <SelectItem value="retweet">Retweet</SelectItem>
                        <SelectItem value="reply">Reply</SelectItem>
                        <SelectItem value="quote">Quote Tweet</SelectItem>
                        <SelectItem value="join">Join Server</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div>
                  <Label>Title</Label>
                  <Input 
                    className="bg-purple-800 border-purple-600"
                    placeholder="e.g., Follow our X account"
                    value={newTask.title}
                    onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  />
                </div>
                
                <div>
                  <Label>Description (optional)</Label>
                  <Textarea 
                    className="bg-purple-800 border-purple-600"
                    placeholder="Additional instructions..."
                    value={newTask.description}
                    onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  />
                </div>
                
                <div>
                  <Label>Target URL</Label>
                  <Input 
                    className="bg-purple-800 border-purple-600"
                    placeholder="https://x.com/your_account"
                    value={newTask.targetUrl}
                    onChange={(e) => setNewTask({ ...newTask, targetUrl: e.target.value })}
                  />
                </div>
                
                <div>
                  <Label>Target Handle (optional)</Label>
                  <Input 
                    className="bg-purple-800 border-purple-600"
                    placeholder="@your_handle"
                    value={newTask.targetHandle}
                    onChange={(e) => setNewTask({ ...newTask, targetHandle: e.target.value })}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Reward (SOL)</Label>
                    <Input 
                      type="number"
                      step="0.001"
                      min="0.001"
                      className="bg-purple-800 border-purple-600"
                      value={newTask.rewardSol}
                      onChange={(e) => setNewTask({ ...newTask, rewardSol: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Max Completions</Label>
                    <Input 
                      type="number"
                      min="1"
                      className="bg-purple-800 border-purple-600"
                      value={newTask.maxCompletions}
                      onChange={(e) => setNewTask({ ...newTask, maxCompletions: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                </div>
                
                <div className="bg-purple-800/50 p-3 rounded-lg">
                  <div className="text-sm text-purple-200">Total Budget Required</div>
                  <div className="text-lg font-bold text-yellow-400">
                    {(parseFloat(newTask.rewardSol || "0") * (newTask.maxCompletions || 1)).toFixed(4)} SOL
                  </div>
                </div>
              </div>
              
              <DialogFooter>
                <Button 
                  variant="outline" 
                  onClick={() => setCreateDialogOpen(false)}
                  className="border-purple-600 text-purple-200"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={() => createTaskMutation.mutate(newTask)}
                  disabled={createTaskMutation.isPending || !newTask.title || !newTask.targetUrl}
                  className="bg-purple-600 hover:bg-purple-700"
                  data-testid="button-confirm-create"
                >
                  {createTaskMutation.isPending ? "Creating..." : "Create Task"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="available" className="w-full">
          <TabsList className="bg-purple-800/50 border-purple-600">
            <TabsTrigger value="available" className="data-[state=active]:bg-purple-600">
              Available Tasks
            </TabsTrigger>
            <TabsTrigger value="my-tasks" className="data-[state=active]:bg-purple-600">
              My Tasks
            </TabsTrigger>
            <TabsTrigger value="my-submissions" className="data-[state=active]:bg-purple-600">
              My Submissions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="available" className="mt-6">
            {tasksLoading ? (
              <div className="text-center py-12 text-purple-300">Loading tasks...</div>
            ) : tasks.length === 0 ? (
              <Card className="bg-purple-800/50 border-purple-600">
                <CardContent className="py-12 text-center text-purple-200">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No tasks available right now. Check back later!</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {tasks.filter(t => t.creatorWallet !== walletAddress).map((task) => (
                  <Card key={task.id} className="bg-purple-800/50 border-purple-600 hover:border-purple-400 transition-colors" data-testid={`card-task-${task.id}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {platformIcons[task.platform] || <Share2 className="w-4 h-4" />}
                          {taskTypeIcons[task.taskType] || <CheckCircle2 className="w-4 h-4" />}
                        </div>
                        {getStatusBadge(task.status)}
                      </div>
                      <CardTitle className="text-lg text-white">{task.title}</CardTitle>
                      {task.description && (
                        <CardDescription className="text-purple-200">{task.description}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-purple-300">Reward</span>
                          <span className="text-yellow-400 font-bold flex items-center gap-1">
                            <Coins className="w-4 h-4" />
                            {formatLamports(task.rewardLamports)} SOL
                          </span>
                        </div>
                        
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-purple-300">Progress</span>
                          <span className="text-purple-100">{task.completedCount} / {task.maxCompletions}</span>
                        </div>
                        
                        <div className="w-full bg-purple-900 rounded-full h-2">
                          <div 
                            className="bg-purple-500 h-2 rounded-full transition-all"
                            style={{ width: `${(task.completedCount / task.maxCompletions) * 100}%` }}
                          />
                        </div>
                        
                        <a 
                          href={task.targetUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-purple-300 hover:text-purple-100 text-sm"
                        >
                          <ExternalLink className="w-3 h-3" />
                          {task.targetHandle || "View target"}
                        </a>
                        
                        <Button 
                          className="w-full bg-purple-600 hover:bg-purple-700 mt-2"
                          disabled={!connected || task.completedCount >= task.maxCompletions}
                          onClick={() => openSubmitDialog(task)}
                          data-testid={`button-complete-${task.id}`}
                        >
                          Complete Task
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="my-tasks" className="mt-6">
            {!connected ? (
              <Card className="bg-purple-800/50 border-purple-600">
                <CardContent className="py-12 text-center text-purple-200">
                  <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Connect your wallet to see your created tasks</p>
                </CardContent>
              </Card>
            ) : myTasksLoading ? (
              <div className="text-center py-12 text-purple-300">Loading your tasks...</div>
            ) : myTasks.length === 0 ? (
              <Card className="bg-purple-800/50 border-purple-600">
                <CardContent className="py-12 text-center text-purple-200">
                  <Plus className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>You haven't created any tasks yet.</p>
                  <Button 
                    className="mt-4 bg-purple-600 hover:bg-purple-700"
                    onClick={() => setCreateDialogOpen(true)}
                  >
                    Create Your First Task
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {myTasks.map((task) => (
                  <Card key={task.id} className="bg-purple-800/50 border-purple-600" data-testid={`card-my-task-${task.id}`}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {platformIcons[task.platform]}
                          <CardTitle className="text-lg text-white">{task.title}</CardTitle>
                        </div>
                        {getStatusBadge(task.status)}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-purple-300">Reward</span>
                          <div className="text-yellow-400 font-bold">{formatLamports(task.rewardLamports)} SOL</div>
                        </div>
                        <div>
                          <span className="text-purple-300">Budget Remaining</span>
                          <div className="text-purple-100">{formatLamports(task.remainingBudgetLamports)} SOL</div>
                        </div>
                        <div>
                          <span className="text-purple-300">Completions</span>
                          <div className="text-purple-100">{task.completedCount} / {task.maxCompletions}</div>
                        </div>
                        <div>
                          <span className="text-purple-300">Created</span>
                          <div className="text-purple-100">{new Date(task.createdAt).toLocaleDateString()}</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="my-submissions" className="mt-6">
            {!connected ? (
              <Card className="bg-purple-800/50 border-purple-600">
                <CardContent className="py-12 text-center text-purple-200">
                  <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Connect your wallet to see your submissions</p>
                </CardContent>
              </Card>
            ) : submissionsLoading ? (
              <div className="text-center py-12 text-purple-300">Loading your submissions...</div>
            ) : mySubmissions.length === 0 ? (
              <Card className="bg-purple-800/50 border-purple-600">
                <CardContent className="py-12 text-center text-purple-200">
                  <Send className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>You haven't submitted any tasks yet.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {mySubmissions.map((submission) => (
                  <Card key={submission.id} className="bg-purple-800/50 border-purple-600" data-testid={`card-submission-${submission.id}`}>
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div>
                            <div className="text-sm text-purple-300">Submitted</div>
                            <div className="text-purple-100">{new Date(submission.submittedAt).toLocaleString()}</div>
                          </div>
                          <div>
                            <div className="text-sm text-purple-300">Reward</div>
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
          <DialogContent className="bg-purple-900 border-purple-600 text-white">
            <DialogHeader>
              <DialogTitle>Submit Task Completion</DialogTitle>
              <DialogDescription className="text-purple-200">
                {selectedTask?.title}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div>
                <Label>Your Handle (optional)</Label>
                <Input 
                  className="bg-purple-800 border-purple-600"
                  placeholder="@your_handle"
                  value={workerHandle}
                  onChange={(e) => setWorkerHandle(e.target.value)}
                />
              </div>
              
              <div>
                <Label>Proof URL (optional)</Label>
                <Input 
                  className="bg-purple-800 border-purple-600"
                  placeholder="Link to screenshot or post proving completion"
                  value={proofUrl}
                  onChange={(e) => setProofUrl(e.target.value)}
                />
                <p className="text-xs text-purple-300 mt-1">
                  Providing proof increases approval chances
                </p>
              </div>
              
              {selectedTask && (
                <div className="bg-purple-800/50 p-3 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="text-purple-200">Reward upon approval</span>
                    <span className="text-yellow-400 font-bold">{formatLamports(selectedTask.rewardLamports)} SOL</span>
                  </div>
                </div>
              )}
            </div>
            
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setSubmitDialogOpen(false)}
                className="border-purple-600 text-purple-200"
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
                className="bg-purple-600 hover:bg-purple-700"
                data-testid="button-confirm-submit"
              >
                {submitTaskMutation.isPending ? "Submitting..." : "Submit Completion"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
