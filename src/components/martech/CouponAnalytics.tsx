import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateTimePicker } from "@/components/ui/DateTimePicker";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Hash, Users, IndianRupee, UserCheck, UserX } from "lucide-react";
import type { Coupon, CouponRedemption } from "./types";
import { formatDiscount } from "./types";

interface CouponAnalyticsProps {
  coupons: Coupon[] | undefined;
  redemptions: CouponRedemption[] | undefined;
}

type StatusFilter = "all" | "active" | "inactive" | "expired";

export function CouponAnalytics({ coupons, redemptions }: CouponAnalyticsProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);

  const filteredRedemptions = useMemo(() => {
    if (!redemptions) return [];
    let result = redemptions;
    if (dateFrom) {
      result = result.filter((r) => new Date(r.redeemed_at) >= dateFrom);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter((r) => new Date(r.redeemed_at) <= to);
    }
    return result;
  }, [redemptions, dateFrom, dateTo]);

  const filteredCoupons = useMemo(() => {
    if (!coupons) return [];
    const now = new Date();
    return coupons.filter((c) => {
      if (statusFilter === "active") return c.is_active && (!c.ends_at || new Date(c.ends_at) > now);
      if (statusFilter === "inactive") return !c.is_active;
      if (statusFilter === "expired") return c.ends_at && new Date(c.ends_at) < now;
      return true;
    });
  }, [coupons, statusFilter]);

  const totalRedemptions = filteredRedemptions.length;
  const uniqueRedeemers = new Set(filteredRedemptions.map((r) => r.redeemed_by_user_id)).size;
  const totalDiscountAmount = filteredRedemptions.reduce(
    (sum, r) => sum + Number(r.discount_amount),
    0
  );

  // Per-coupon breakdown with issued_to vs shared analysis
  const filteredCouponIds = useMemo(() => new Set(filteredCoupons.map((c) => c.id)), [filteredCoupons]);

  const perCoupon = useMemo(() => {
    const map = new Map<string, { count: number; amount: number; redeemers: Set<string> }>();

    for (const r of filteredRedemptions) {
      if (!filteredCouponIds.has(r.coupon_id)) continue;
      const entry = map.get(r.coupon_id) ?? { count: 0, amount: 0, redeemers: new Set() };
      entry.count++;
      entry.amount += Number(r.discount_amount);
      entry.redeemers.add(r.redeemed_by_user_id);
      map.set(r.coupon_id, entry);
    }

    return filteredCoupons.map((coupon) => {
      const stats = map.get(coupon.id) ?? { count: 0, amount: 0, redeemers: new Set<string>() };
      const issuedToId = coupon?.issued_to_user_id;

      // Count redeemers that match issued_to
      let matchedRedeemers = 0;
      let sharedRedeemers = 0;
      for (const uid of stats.redeemers) {
        if (issuedToId && uid === issuedToId) {
          matchedRedeemers++;
        } else {
          sharedRedeemers++;
        }
      }

      return {
        coupon,
        count: stats.count,
        maxRedemptions: coupon.max_redemptions ?? 3,
        remainingRedemptions: Math.max((coupon.max_redemptions ?? 3) - stats.count, 0),
        amount: stats.amount,
        uniqueRedeemers: stats.redeemers.size,
        matchedRedeemers,
        sharedRedeemers,
      };
    });
  }, [filteredCoupons, filteredRedemptions, filteredCouponIds]);

  const topRedeemers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const redemption of filteredRedemptions) {
      counts.set(redemption.redeemed_by_user_id, (counts.get(redemption.redeemed_by_user_id) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([redeemerId, count]) => ({ redeemerId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [filteredRedemptions]);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <DateTimePicker
                label="From Date"
                value={dateFrom}
                onChange={setDateFrom}
                includeTime={false}
              />
            </div>
            <div className="space-y-1.5">
              <DateTimePicker label="To Date" value={dateTo} onChange={setDateTo} includeTime={false} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Hash className="h-8 w-8 text-primary opacity-70" />
              <div>
                <p className="text-sm text-muted-foreground">Total Redemptions</p>
                <p className="text-2xl font-bold text-foreground">{totalRedemptions}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-primary opacity-70" />
              <div>
                <p className="text-sm text-muted-foreground">Unique Redeemers</p>
                <p className="text-2xl font-bold text-foreground">{uniqueRedeemers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <IndianRupee className="h-8 w-8 text-primary opacity-70" />
              <div>
                <p className="text-sm text-muted-foreground">Total Discount Given</p>
                <p className="text-2xl font-bold text-foreground">
                  ₹{totalDiscountAmount.toLocaleString("en-IN")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-coupon breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Per-Coupon Breakdown</CardTitle>
          <p className="text-sm text-muted-foreground">Includes coupons with zero redemptions.</p>
        </CardHeader>
        <CardContent>
          {perCoupon.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Issued To</TableHead>
                  <TableHead>Redemptions</TableHead>
                  <TableHead>Max</TableHead>
                  <TableHead>Remaining</TableHead>
                  <TableHead>Unique Users</TableHead>
                  <TableHead>Issued-To Match</TableHead>
                  <TableHead>Shared Use</TableHead>
                  <TableHead>Total Discount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perCoupon.map((row) => (
                  <TableRow key={row.coupon?.id ?? "unknown"}>
                    <TableCell>
                      <code className="font-mono text-sm bg-muted px-2 py-0.5 rounded">
                        {row.coupon?.code ?? "Deleted"}
                      </code>
                    </TableCell>
                    <TableCell>
                      {row.coupon ? (
                        <Badge variant="secondary">
                          {formatDiscount(row.coupon.discount_type, row.coupon.discount_value)}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[140px] truncate">
                      {row.coupon?.issued_to_email || "—"}
                    </TableCell>
                    <TableCell>{row.count}</TableCell>
                    <TableCell>{row.maxRedemptions}</TableCell>
                    <TableCell>{row.remainingRedemptions}</TableCell>
                    <TableCell>{row.uniqueRedeemers}</TableCell>
                    <TableCell>
                      {row.coupon?.issued_to_user_id ? (
                        <div className="flex items-center gap-1">
                          <UserCheck className="h-3.5 w-3.5 text-primary" />
                          <span className="text-sm">{row.matchedRedeemers}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">n/a</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <UserX className="h-3.5 w-3.5 text-destructive" />
                        <span className="text-sm">{row.sharedRedeemers}</span>
                      </div>
                    </TableCell>
                    <TableCell>₹{row.amount.toLocaleString("en-IN")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="py-8 text-center text-muted-foreground">No coupons match the current filters.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top Redeemers</CardTitle>
          <p className="text-sm text-muted-foreground">Top users by redemption count in the current filter range.</p>
        </CardHeader>
        <CardContent>
          {topRedeemers.length === 0 ? (
            <div className="text-sm text-muted-foreground">No redemptions in this range.</div>
          ) : (
            <div className="space-y-2">
              {topRedeemers.map((item) => (
                <div key={item.redeemerId} className="flex items-center justify-between text-sm">
                  <code className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{item.redeemerId}</code>
                  <span className="text-muted-foreground">{item.count} redemption(s)</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
