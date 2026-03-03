import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SearchIcon, ShieldAlertIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const mockNodes = [
  { id: '1', hostname: 'node-worker-01', status: 'online', type: 'Infrastructure', load: '45%' },
  { id: '2', hostname: 'node-exec-02', status: 'offline', type: 'Exec Policies', load: '0%' },
];

export function NodesPage() {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'infrastructure' | 'exec approvals'>('infrastructure');

  return (
    <div className="flex-1 w-full min-w-0 flex flex-col h-full bg-background p-6 md:p-8 overflow-y-auto space-y-8">
      <div className="flex gap-4 items-center mb-6">
        <div className="relative flex-1 max-w-md">
          <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search nodes by hostname..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-card border-border"
          />
        </div>
        <div className="flex bg-muted p-1 rounded-md">
          {['infrastructure', 'exec approvals'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as 'infrastructure' | 'exec approvals')}
              className={`px-4 py-1.5 text-xs font-medium rounded capitalize transition-all ${activeTab === tab ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {tab}
            </button>
          ))}
        </div>
        <Button size="sm" variant="destructive" className="text-xs gap-2">
          <ShieldAlertIcon className="w-4 h-4" />
          Security Audit
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {activeTab === 'infrastructure' ? (
          mockNodes.map((node) => (
            <Card
              key={node.id}
              className="bg-card border-border/70 flex flex-col hover:border-border transition-colors"
            >
              <CardHeader className="pb-3 flex flex-row justify-between items-start space-y-0">
                <CardTitle className="text-lg font-semibold truncate pr-4 font-mono">
                  {node.hostname}
                </CardTitle>
                <Badge
                  variant={node.status === 'online' ? 'default' : 'destructive'}
                  className="capitalize text-[10px] h-5"
                >
                  {node.status}
                </Badge>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <div className="space-y-3 mt-4 mb-6">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Type</span>
                    <span className="font-medium">{node.type}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Current Load</span>
                    <span className="font-mono">{node.load}</span>
                  </div>
                </div>
                <div className="flex gap-2 w-full mt-auto pt-4 border-t border-border/50">
                  <button className="flex-1 text-xs py-2 bg-secondary/50 hover:bg-secondary text-secondary-foreground rounded transition-colors">
                    Reboot
                  </button>
                  <button className="flex-1 text-xs py-2 bg-secondary/50 hover:bg-secondary text-secondary-foreground rounded transition-colors">
                    SSH Logs
                  </button>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="col-span-1 md:col-span-2 lg:col-span-3">
            <Card className="bg-card border-border/70">
              <div className="flex items-center justify-center p-16 text-center text-muted-foreground">
                <div>
                  <ShieldAlertIcon className="w-12 h-12 mx-auto mb-4 opacity-50 text-destructive" />
                  <h3 className="font-semibold text-lg text-foreground mb-2">
                    Execution Approvals Required
                  </h3>
                  <p className="max-w-md mx-auto">
                    No pending executions waiting for authorization. Turn on high-security mode to
                    require manual verification for all tool callbacks targeting local shell
                    scripts.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

export default NodesPage;
