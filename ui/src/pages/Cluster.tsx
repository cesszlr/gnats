import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useConnection } from '../contexts/ConnectionContext';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../api/client';
import { RefreshCcw, Network, Server, Cpu, HardDrive, Info, ShieldAlert, ArrowRightLeft, ShieldX } from 'lucide-react';
import { formatBytes, formatNumber } from '../utils/format';
import * as d3Force from 'd3-force';

interface RouteInfo {
  remote_id: string;
  remote_name: string;
  ip: string;
  port: number;
  rtt?: string;
  pending_size?: number;
  in_msgs?: number;
  out_msgs?: number;
  in_bytes?: number;
  out_bytes?: number;
}

interface LeafnodeInfo {
  account: string;
  ip: string;
  port: number;
  rtt?: string;
  in_msgs?: number;
  out_msgs?: number;
  in_bytes?: number;
  out_bytes?: number;
}

interface ClusterTopologyData {
  server_id: string;
  server_name: string;
  cluster_name: string;
  routes?: RouteInfo[];
  leafnodes?: LeafnodeInfo[];
}

const Cluster: React.FC = () => {
  const { activeConnection } = useConnection();
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<'topology' | 'stats'>('topology');
  const [topology, setTopology] = useState<ClusterTopologyData | null>(null);
  const [nodesStats, setNodesStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Selected item for detail panel
  const [selectedItem, setSelectedItem] = useState<{
    type: 'server' | 'route' | 'leafnode';
    data: any;
  } | null>(null);

  const selectedItemRef = useRef(selectedItem);
  useEffect(() => {
    selectedItemRef.current = selectedItem;
  }, [selectedItem]);

  const refreshTimer = useRef<any>(null);
  const lastNodesRef = useRef<any[]>([]);

  const loadClusterData = async (showLoading = false) => {
    if (!activeConnection) return;
    if (showLoading) setLoading(true);
    setErrorMsg(null);

    try {
      // Fetch topology
      const topoData = await apiClient.getClusterTopology(activeConnection.id);
      setTopology(topoData);

      // Fetch individual node statistics
      const statsData = await apiClient.getClusterNodesStats(activeConnection.id);
      const currentStats = statsData.nodes || [];
      setNodesStats(currentStats);

      const currentSelected = selectedItemRef.current;

      // Auto select local server by default if nothing selected yet
      if (!currentSelected && topoData) {
        const localNodeStats = currentStats.find(
          (n: any) => n.server_id === topoData.server_id
        );
        setSelectedItem({
          type: 'server',
          data: localNodeStats || {
            server_id: topoData.server_id,
            server_name: topoData.server_name,
            cluster: topoData.cluster_name,
          },
        });
      } else if (currentSelected) {
        if (currentSelected.type === 'server') {
          // Keep selected server data fresh
          const selectedId = currentSelected.data.server_id || currentSelected.data.id;
          const updated = currentStats.find(
            (n: any) => n.server_id === selectedId
          );
          if (updated) {
            setSelectedItem({ type: 'server', data: updated });
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || String(err));
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    loadClusterData(true);

    // Setup auto-refresh every 5 seconds
    refreshTimer.current = setInterval(() => {
      loadClusterData(false);
    }, 5000);

    return () => {
      if (refreshTimer.current) {
        clearInterval(refreshTimer.current);
      }
    };
  }, [activeConnection]);

  // SVG Topology Layout Coordinates Calculation using d3-force
  const topologyLayout = useMemo(() => {
    if (!topology) return null;

    const centerX = 320;
    const centerY = 240;

    const localNodeId = topology.server_id;
    const routesList = topology.routes || [];
    const leafList = topology.leafnodes || [];

    // De-duplicate routes by remote_id to prevent duplicate node IDs in D3 layout simulation
    const seenRouteIds = new Set<string>();
    const uniqueRoutes: any[] = [];
    routesList.forEach(r => {
      if (!r.remote_id || r.remote_id === localNodeId) return;
      if (seenRouteIds.has(r.remote_id)) return;
      seenRouteIds.add(r.remote_id);
      uniqueRoutes.push(r);
    });

    // 1. Organize logical node objects
    const localNode: any = {
      id: localNodeId,
      name: topology.server_name || t('local_node'),
      isLocal: true,
      type: 'server',
      isMonitored: true
    };

    const rawNodes: any[] = [localNode];

    // Route nodes
    uniqueRoutes.forEach(r => {
      const hasStats = nodesStats.some(n => n.server_id === r.remote_id && n.cpu !== undefined);
      rawNodes.push({
        id: r.remote_id,
        name: r.remote_name || r.ip || t('remote_node'),
        isLocal: false,
        type: 'server',
        isMonitored: hasStats,
        ip: r.ip,
        port: r.port
      });
    });

    // Leaf nodes
    leafList.forEach((leaf, idx) => {
      rawNodes.push({
        ...leaf,
        id: `leaf-${idx}`,
        name: t('leaf'),
        type: 'leafnode',
        isLeaf: true,
        isMonitored: true
      });
    });

    // 2. Reuse previous coordinates to prevent flickering/jumping
    const prevNodesMap = new Map<string, { x: number; y: number }>();
    lastNodesRef.current.forEach(n => {
      if (n.x !== undefined && n.y !== undefined) {
        prevNodesMap.set(n.id, { x: n.x, y: n.y });
      }
    });

    rawNodes.forEach(node => {
      const prev = prevNodesMap.get(node.id);
      if (prev) {
        node.x = prev.x;
        node.y = prev.y;
      } else {
        node.x = centerX + (Math.random() - 0.5) * 40;
        node.y = centerY + (Math.random() - 0.5) * 40;
      }
    });

    // Check if structure changed to prevent wiggling/rotation on auto-refresh
    const hasStructureChanged = lastNodesRef.current.length === 0 || 
      lastNodesRef.current.length !== rawNodes.length ||
      !rawNodes.every(n => prevNodesMap.has(n.id));

    // 3. Construct force simulation links
    const links: any[] = [];
    
    // Core routes links
    uniqueRoutes.forEach(r => {
      links.push({
        source: localNodeId,
        target: r.remote_id,
        isRoute: true,
        rtt: r.rtt,
        data: r
      });
    });

    // Leaf node links
    leafList.forEach((_, idx) => {
      links.push({
        source: localNodeId,
        target: `leaf-${idx}`,
        isLeaf: true
      });
    });

    // 4. Run Force Simulation (only when structure changes to prevent wiggling on refresh)
    if (hasStructureChanged) {
      const simulation = d3Force.forceSimulation(rawNodes)
        .force('link', d3Force.forceLink(links).id((d: any) => d.id).distance((d: any) => d.isLeaf ? 80 : 140))
        .force('charge', d3Force.forceManyBody().strength((d: any) => d.type === 'leafnode' ? -120 : -500))
        .force('center', d3Force.forceCenter(centerX, centerY))
        .force('collision', d3Force.forceCollide().radius((d: any) => d.type === 'leafnode' ? 25 : 55))
        .stop();

      // Iterate 200 times to converge simulation
      for (let i = 0; i < 200; ++i) {
        simulation.tick();
      }
    } else {
      // Just copy the coordinates from prevNodesMap
      rawNodes.forEach(node => {
        const prev = prevNodesMap.get(node.id);
        if (prev) {
          node.x = prev.x;
          node.y = prev.y;
        }
      });
    }

    // 5. Store current layout coordinates
    lastNodesRef.current = rawNodes;

    // 6. Prepare final structure for rendering
    const nodes = rawNodes.filter(n => n.type === 'server');
    const leafnodes = rawNodes.filter(n => n.type === 'leafnode');
    const processedRoutes = links.filter(l => l.isRoute).map(l => {
      const srcNode = rawNodes.find(n => n.id === (l.source && typeof l.source === 'object' ? l.source.id : l.source));
      const tgtNode = rawNodes.find(n => n.id === (l.target && typeof l.target === 'object' ? l.target.id : l.target));
      return {
        ...l.data,
        source: srcNode || { x: 0, y: 0 },
        target: tgtNode || { x: 0, y: 0 }
      };
    });


    return {
      nodes,
      routes: processedRoutes,
      leafnodes,
      localNodeId
    };
  }, [topology, nodesStats, t]);

  // Combine monitored stats with unmonitored topology nodes to display everything on the stats grid
  const allNodesStats = useMemo(() => {
    if (!topology) return [];

    const list = [...nodesStats];
    const localNodeId = topology.server_id;
    const routesList = topology.routes || [];

    // De-duplicate routes by remote_id to get unique node IDs
    const seenRemoteIds = new Set<string>();
    const uniqueRemotes: any[] = [];
    routesList.forEach(r => {
      if (!r.remote_id || r.remote_id === localNodeId) return;
      if (seenRemoteIds.has(r.remote_id)) return;
      seenRemoteIds.add(r.remote_id);
      uniqueRemotes.push(r);
    });

    // Ensure local node is in nodesStats
    const hasLocalStats = list.some(n => n.server_id === localNodeId);
    if (!hasLocalStats) {
      list.push({
        server_id: localNodeId,
        server_name: topology.server_name || t('local_node'),
        version: '',
        uptime: '',
        cpu: undefined,
        mem: undefined,
        go: undefined,
        connections: undefined,
        isUnmonitored: true
      });
    }

    // Ensure remote route nodes are in nodesStats
    uniqueRemotes.forEach(r => {
      const hasStats = list.some(n => n.server_id === r.remote_id);
      if (!hasStats) {
        list.push({
          server_id: r.remote_id,
          server_name: r.remote_name || r.ip || t('remote_node'),
          version: '',
          uptime: '',
          cpu: undefined,
          mem: undefined,
          go: undefined,
          connections: undefined,
          isUnmonitored: true,
          ip: r.ip,
          port: r.port
        });
      }
    });

    return list;
  }, [topology, nodesStats, t]);

  const renderStatsGrid = () => {
    if (allNodesStats.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
          {t('no_cluster_data')}
        </div>
      );
    }

    const formatServerId = (id: string) => {
      if (!id) return '';
      return id.length > 16 ? `${id.substring(0, 6)}...${id.slice(-6)}` : id;
    };

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.5rem', marginTop: '1rem' }}>
        {allNodesStats.map((node: any) => {
          const isLocal = node.server_id === topology?.server_id;
          const isUnmonitored = node.isUnmonitored;
          const cpuUsage = (node.cpu || 0).toFixed(1);
          const isHighLoad = node.cpu > 80 || (node.slow_consumers || 0) > 0;

          if (isUnmonitored) {
            return (
              <div
                key={node.server_id}
                className="card animate-fade-in"
                style={{
                  padding: '1.5rem',
                  borderLeft: '4px solid var(--border-color)',
                  opacity: 0.7,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  backgroundColor: 'rgba(0,0,0,0.02)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', color: 'var(--text-secondary)' }}>
                      <Server size={18} color="rgba(156, 163, 175, 0.8)" />
                      {node.server_name}
                      <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.35rem', background: 'var(--border-color)', color: 'var(--text-secondary)', borderRadius: '3px' }}>
                        {t('unmonitored')}
                      </span>
                    </h3>
                     <span 
                      className="custom-tooltip" 
                      data-tooltip={node.server_id} 
                      style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace', cursor: 'help', display: 'inline-block', whiteSpace: 'nowrap' }}
                     >
                       ID: {formatServerId(node.server_id)}
                     </span>
                  </div>
                </div>

                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column',
                  gap: '0.4rem',
                  backgroundColor: 'var(--card-bg)', 
                  padding: '0.75rem', 
                  borderRadius: '6px',
                  border: '1px dashed var(--border-color)',
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    <ShieldAlert size={16} color="var(--text-secondary)" />
                    {t('unmonitored')}
                  </div>
                  <div style={{ fontSize: '0.75rem' }}>
                    {t('unmonitored_desc')}
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div
              key={node.server_id}
              className="card animate-fade-in"
              style={{
                padding: '1.5rem',
                borderLeft: isLocal ? '4px solid var(--accent-color)' : '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <Server size={18} color={isHighLoad ? 'var(--error-color)' : 'var(--success-color)'} />
                    {node.server_name}
                    {isLocal && (
                      <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.35rem', background: 'var(--accent-color)', color: 'white', borderRadius: '3px' }}>
                        {t('current')}
                      </span>
                    )}
                  </h3>
                  <span 
                    className="custom-tooltip" 
                    data-tooltip={node.server_id} 
                    style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace', cursor: 'help', display: 'inline-block', whiteSpace: 'nowrap' }}
                  >
                    ID: {formatServerId(node.server_id)}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: '0.75rem', color: 'var(--text-secondary)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                  <span>v{node.version}</span>
                  <span>{t('uptime')}: {node.uptime}</span>
                </div>
              </div>

              {/* Hardware Usage Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', backgroundColor: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                  <Cpu size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>CPU</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{cpuUsage}% ({node.cores || 1} Cores)</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                  <HardDrive size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{t('memory')}</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{formatBytes(node.mem || 0)}</div>
                  </div>
                </div>
              </div>

              {/* Throughput Data */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', textAlign: 'center', fontSize: '0.8rem' }}>
                <div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>{t('connections_count')}</div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{formatNumber(node.connections ?? 0)}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>{t('slow_consumers')}</div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem', color: node.slow_consumers > 0 ? 'var(--error-color)' : 'var(--text-primary)' }}>
                    {formatNumber(node.slow_consumers ?? 0)}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>{t('bytes_in')}</div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{formatBytes(node.in_bytes || 0)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderDetailPanel = () => {
    if (!selectedItem) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.5, padding: '2rem', textAlign: 'center' }}>
          <Info size={40} style={{ marginBottom: '1rem' }} />
          <p style={{ fontSize: '0.9rem' }}>{t('select_topology_hint')}</p>
        </div>
      );
    }

    const { type, data } = selectedItem;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', height: '100%' }}>
        <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {type === 'server' && <Server size={18} color={data.cpu !== undefined ? 'var(--accent-color)' : 'rgba(156, 163, 175, 0.8)'} />}
            {type === 'route' && <ArrowRightLeft size={18} color="var(--success-color)" />}
            {type === 'leafnode' && <Network size={18} color="#9c27b0" />}
            {type === 'server' && (data.server_name || t('nats_server'))}
            {type === 'route' && (data.remote_name ? `${data.remote_name} ${t('connections')}` : t('route_connection'))}
            {type === 'leafnode' && (data.account ? `${t('leafnode')} (${data.account.slice(0, 8)}...)` : t('leafnode'))}
          </h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', wordBreak: 'break-all', fontFamily: 'monospace' }}>
            {type === 'server' ? `ID: ${data.server_id || data.id}` : `Remote IP: ${data.ip || '-'}`}
          </span>
        </div>

        <div className="scroll-area" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.85rem' }}>
          {type === 'server' && (
            <>
              {/* Server Unmonitored Warning Guide */}
              {data.cpu === undefined ? (
                <div style={{
                  padding: '1rem',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px dashed var(--border-color)',
                  borderRadius: 'var(--radius)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  color: 'var(--text-secondary)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                    <ShieldX size={18} color="var(--text-secondary)" />
                    {t('unmonitored')}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.75rem', lineHeight: '1.4' }}>
                    {t('unmonitored_desc')}
                  </p>
                  <div style={{ fontSize: '0.75rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem' }}>
                    <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '0.25rem' }}>如何开启监控：</strong>
                    <code style={{ background: 'var(--card-bg)', padding: '0.1rem 0.35rem', borderRadius: '3px', fontFamily: 'monospace', display: 'block', wordBreak: 'break-all', margin: '0.25rem 0' }}>
                      nats-server -c config.conf -m 8222
                    </code>
                    <span>或在配置文件中声明 <code>monitor_port: 8222</code>，并检查 Docker 网络/防火墙策略以保证端口网络可达。</span>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{t('status')}:</span>
                    <strong style={{ color: 'var(--success-color)' }}>{t('healthy')}</strong>
                  </div>
                  {data.cluster && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{t('cluster_name')}:</span>
                      <strong>{typeof data.cluster === 'object' ? data.cluster.name : data.cluster}</strong>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{t('cpu_cores')}:</span>
                    <strong>{data.cores || 1}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{t('cpu_usage')}:</span>
                    <strong>{data.cpu.toFixed(1)}%</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{t('memory')}:</span>
                    <strong>{formatBytes(data.mem || 0)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{t('connections_count')}:</span>
                    <strong>{formatNumber(data.connections)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{t('slow_consumers')}:</span>
                    <strong style={{ color: data.slow_consumers > 0 ? 'var(--error-color)' : '' }}>{formatNumber(data.slow_consumers)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{t('messages_in_out')}:</span>
                    <strong>{formatNumber(data.in_msgs)} / {formatNumber(data.out_msgs)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{t('bytes_in_out')}:</span>
                    <strong>{formatBytes(data.in_bytes || 0)} / {formatBytes(data.out_bytes || 0)}</strong>
                  </div>
                </>
              )}
            </>
          )}

          {type === 'route' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{t('name')}:</span>
                <strong>{data.remote_name || '-'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
                <span style={{ color: 'var(--text-secondary)' }}>ID:</span>
                <strong style={{ fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all' }}>{data.remote_id || '-'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{t('rtt')}:</span>
                <strong style={{ color: 'var(--accent-color)' }}>{data.rtt || '-'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{t('pending_bytes')}:</span>
                <strong>{formatBytes(data.pending_size || 0)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{t('messages_in_out')}:</span>
                <strong>{formatNumber(data.in_msgs)} / {formatNumber(data.out_msgs)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{t('bytes_in_out')}:</span>
                <strong>{formatBytes(data.in_bytes || 0)} / {formatBytes(data.out_bytes || 0)}</strong>
              </div>
            </>
          )}

          {type === 'leafnode' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', flexDirection: 'column', gap: '0.25rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>NATS {t('account')}:</span>
                <strong style={{ wordBreak: 'break-all', fontFamily: 'monospace', fontSize: '0.75rem', background: 'var(--bg-secondary)', padding: '0.25rem', borderRadius: '4px' }}>
                  {data.account || '-'}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{t('ip_address')}:</span>
                <strong>{data.ip}:{data.port}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{t('rtt')}:</span>
                <strong style={{ color: '#9c27b0' }}>{data.rtt || '-'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{t('messages_in_out')}:</span>
                <strong>{formatNumber(data.in_msgs)} / {formatNumber(data.out_msgs)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{t('bytes_in_out')}:</span>
                <strong>{formatBytes(data.in_bytes || 0)} / {formatBytes(data.out_bytes || 0)}</strong>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  if (!activeConnection) return <div>{t('select_connection')}</div>;

  return (
    <div style={{ height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexShrink: 0 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <Network size={28} style={{ color: 'var(--accent-color)' }} />
            {t('cluster_monitoring')}
          </h1>
          {topology && (
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {t('cluster')}: <strong>{topology.cluster_name || 'NATS_Default'}</strong>
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div className="btn-group">
            <button className={`btn ${activeTab === 'topology' ? 'active' : ''}`} onClick={() => setActiveTab('topology')}>
              {t('topology_view')}
            </button>
            <button className={`btn ${activeTab === 'stats' ? 'active' : ''}`} onClick={() => setActiveTab('stats')}>
              {t('node_stats')}
            </button>
          </div>
          <button className="btn btn-secondary" onClick={() => loadClusterData(true)} disabled={loading} title={t('refresh')}>
            <RefreshCcw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {errorMsg && (
        <div
          style={{
            padding: '1.25rem',
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            borderLeft: '4px solid var(--error-color)',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
            flexShrink: 0,
          }}
        >
          <ShieldAlert size={20} color="var(--error-color)" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-primary)' }}>{t('no_cluster_data')}</strong>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {errorMsg.includes('monitoring') ? t('no_cluster_hint') : errorMsg}
            </span>
          </div>
        </div>
      )}

      {loading && !topology && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1 }}>
          <div className="skeleton" style={{ height: '300px', borderRadius: 'var(--radius)' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', flex: 1 }}>
            <div className="skeleton" style={{ borderRadius: 'var(--radius)' }} />
            <div className="skeleton" style={{ borderRadius: 'var(--radius)' }} />
          </div>
        </div>
      )}

      {!loading && !errorMsg && activeTab === 'topology' && topologyLayout && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '2.0rem', flex: 1, overflow: 'hidden' }}>
          {/* Left Column: Visual Canvas */}
          <div
            className="card"
            style={{
              padding: 0,
              backgroundColor: 'rgba(0,0,0,0.015)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              position: 'relative',
              border: '1px solid var(--border-color)',
            }}
          >
            <svg width="100%" height="100%" viewBox="0 0 640 480" style={{ pointerEvents: 'all' }}>
              {/* Grid background for blueprint feel */}
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(0,0,0,0.03)" strokeWidth="1" />
                </pattern>
                <marker id="arrow" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 2 L 10 5 L 0 8 z" fill="var(--border-color)" />
                </marker>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />

              {/* 1. Draw Route Connection Lines */}
              {topologyLayout.routes.map((route, idx) => {
                const isSelected = selectedItem?.type === 'route' && selectedItem.data.remote_id === route.remote_id;
                const isTargetMonitored = route.target.isMonitored;
                return (
                  <g key={`route-${idx}`} style={{ cursor: 'pointer' }} onClick={() => setSelectedItem({ type: 'route', data: route })}>
                    <line
                      x1={route.source.x}
                      y1={route.source.y}
                      x2={route.target.x}
                      y2={route.target.y}
                      stroke={!isTargetMonitored ? 'rgba(156, 163, 175, 0.4)' : isSelected ? 'var(--success-color)' : 'var(--border-color)'}
                      strokeWidth={isSelected ? 3 : 2}
                      strokeDasharray={!isTargetMonitored ? '4,4' : undefined}
                      markerEnd="url(#arrow)"
                      style={{ transition: 'stroke 0.2s, stroke-width 0.2s' }}
                    />
                    {/* Interactive wider line for easier clicking */}
                    <line
                      x1={route.source.x}
                      y1={route.source.y}
                      x2={route.target.x}
                      y2={route.target.y}
                      stroke="transparent"
                      strokeWidth={12}
                    />
                    {/* RTT Text Badge */}
                    {route.rtt && (
                      <g>
                        <rect
                          x={(route.source.x + route.target.x) / 2 - 25}
                          y={(route.source.y + route.target.y) / 2 - 10}
                          width={50}
                          height={20}
                          rx={4}
                          fill="var(--card-bg)"
                          stroke="var(--border-color)"
                          strokeWidth={1}
                        />
                        <text
                          x={(route.source.x + route.target.x) / 2}
                          y={(route.source.y + route.target.y) / 2 + 4}
                          textAnchor="middle"
                          fontSize="9"
                          fontWeight={600}
                          fill="var(--text-secondary)"
                        >
                          {route.rtt}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* 2. Draw Leafnode Connection Lines */}
              {topologyLayout.leafnodes.map((leaf, idx) => {
                const isSelected = selectedItem?.type === 'leafnode' && selectedItem.data.id === leaf.id;
                const parentNode = topologyLayout.nodes.find(n => n.id === topologyLayout.localNodeId);
                if (!parentNode) return null;

                return (
                  <line
                    key={`leaf-line-${idx}`}
                    x1={parentNode.x}
                    y1={parentNode.y}
                    x2={leaf.x}
                    y2={leaf.y}
                    stroke={isSelected ? '#9c27b0' : 'rgba(156, 39, 176, 0.4)'}
                    strokeWidth={isSelected ? 2 : 1.5}
                    strokeDasharray="4,4"
                    style={{ transition: 'all 0.2s' }}
                  />
                );
              })}

              {/* 3. Draw Leafnode Circle Handles */}
              {topologyLayout.leafnodes.map((leaf, idx) => {
                const isSelected = selectedItem?.type === 'leafnode' && selectedItem.data.id === leaf.id;
                return (
                  <g
                    key={`leaf-node-${idx}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedItem({ type: 'leafnode', data: leaf })}
                  >
                    <circle
                      cx={leaf.x}
                      cy={leaf.y}
                      r={isSelected ? 10 : 8}
                      fill="#9c27b0"
                      stroke="var(--card-bg)"
                      strokeWidth={2}
                      style={{ transition: 'r 0.2s' }}
                    />
                    <text
                      x={leaf.x}
                      y={leaf.y + 20}
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="500"
                      fill="var(--text-secondary)"
                    >
                      {t('leaf')}
                    </text>
                  </g>
                );
              })}

              {/* 4. Draw Core Server Nodes */}
              {topologyLayout.nodes.map(node => {
                const isSelected = selectedItem?.type === 'server' && (selectedItem.data.server_id === node.id || selectedItem.data.id === node.id);
                const isHighLoad = nodesStats.find(n => n.server_id === node.id)?.cpu > 80;
                const isMonitored = node.isMonitored;

                return (
                  <g
                    key={node.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      const fullNodeData = nodesStats.find(n => n.server_id === node.id) || node;
                      setSelectedItem({ type: 'server', data: fullNodeData });
                    }}
                  >
                    {/* Ring highlight when selected */}
                    {isSelected && (
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={28}
                        fill="none"
                        stroke={isMonitored ? 'var(--accent-color)' : 'var(--text-secondary)'}
                        strokeWidth={2}
                        className="animate-pulse"
                      />
                    )}

                    {/* Outer Circle Container */}
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={22}
                      fill={!isMonitored ? 'var(--bg-secondary)' : 'var(--card-bg)'}
                      stroke={!isMonitored ? 'rgba(156, 163, 175, 0.5)' : isHighLoad ? 'var(--error-color)' : isSelected ? 'var(--accent-color)' : 'var(--border-color)'}
                      strokeWidth={isSelected ? 3 : 2}
                      style={{ transition: 'stroke 0.2s, stroke-width 0.2s' }}
                    />

                    {/* Server Icon inside Circle */}
                    <svg
                      x={node.x - 10}
                      y={node.y - 10}
                      width={20}
                      height={20}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={!isMonitored ? 'rgba(156, 163, 175, 0.7)' : isHighLoad ? 'var(--error-color)' : node.isLocal ? 'var(--accent-color)' : 'var(--text-primary)'}
                      strokeWidth="2.5"
                    >
                      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                      <line x1="6" y1="6" x2="6.01" y2="6" />
                      <line x1="6" y1="18" x2="6.01" y2="18" />
                    </svg>

                    {/* Server Node Label */}
                    <text
                      x={node.x}
                      y={node.y + 36}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="bold"
                      fill={!isMonitored ? 'var(--text-secondary)' : 'var(--text-primary)'}
                    >
                      {node.name}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Quick Status Legend at Bottom Left of canvas */}
            <div
              style={{
                position: 'absolute',
                bottom: '1rem',
                left: '1rem',
                backgroundColor: 'var(--card-bg)',
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                gap: '1rem',
                fontSize: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent-color)' }} />
                <span>{t('local')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#9c27b0' }} />
                <span>{t('leafnode')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--border-color)' }} />
                <span>{t('route')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'rgba(156, 163, 175, 0.6)' }} />
                <span>{t('unmonitored')}</span>
              </div>
            </div>
          </div>

          {/* Right Column: Node Details Panel */}
          <div className="card" style={{ padding: '1.25rem', height: '100%', overflow: 'hidden' }}>
            {renderDetailPanel()}
          </div>
        </div>
      )}

      {!loading && !errorMsg && activeTab === 'stats' && renderStatsGrid()}
    </div>
  );
};

export default Cluster;
