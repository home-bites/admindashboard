import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Grid, Card, CardContent, Chip, Button, TextField } from '@mui/material';
import { Map, Person, Phone, VpnKey, CheckCircle } from '@mui/icons-material';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../firebase/firebaseConfig';
import LiveDeliveryMap from '../components/LiveDeliveryMap';
import { useDeliveryPartnerStore } from '../store/deliveryPartnerStore';

const DeliveryDashboard = () => {
  /**
   * Live orders that are out with a rider.
   *
   * This page previously rendered two hardcoded rows — "John Doe" and
   * "Jane Smith" at invented addresses — and its OTP button called alert()
   * and flipped a local flag. Nothing here touched Firestore, so it showed
   * the same two fictional deliveries whatever was actually happening, and
   * "verifying" a code changed nothing anywhere.
   *
   * A page that looks like it works is worse than one that is obviously
   * unfinished: someone could have marked a real delivery complete here and
   * believed it.
   */
  const {
    deliveryPartners,
    subscribeDeliveryPartners,
    disconnectDeliveryPartners,
  } = useDeliveryPartnerStore();

  useEffect(() => {
    subscribeDeliveryPartners?.();
    return () => disconnectDeliveryPartners?.();
  }, [subscribeDeliveryPartners, disconnectDeliveryPartners]);

  const [assignedOrders, setAssignedOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [otpInputs, setOtpInputs] = useState({});
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    // Orders that have left the kitchen. Filtered in JS rather than with a
    // compound where(): status casing varies between the clients that write
    // it, and an `in` query would silently miss any spelling not listed.
    const q = query(
      collection(db, 'orders'),
      orderBy('createdAt', 'desc'),
      limit(100),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const live = [];
        snap.forEach((d) => {
          const o = d.data() || {};
          const status = String(o.status || '').toLowerCase().replace(/\s+/g, '_');
          if (o.isDeleted === true) return;
          if (!['ready', 'out_for_delivery', 'outfordelivery', 'assigned'].includes(status)) return;
          live.push({
            id: d.id,
            orderId: o.orderId || d.id,
            customerName: o.customerName || 'Customer',
            phone: o.customerPhone || o.customerMobile || '',
            address:
              o.deliveryAddress?.addressLine ||
              o.deliveryAddress?.doorInfo ||
              'See map link',
            rider: o.assignedPartnerName || 'Unassigned',
            status,
          });
        });
        setAssignedOrders(live);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, []);

  const handleOtpChange = (id, value) => {
    setOtpInputs(prev => ({ ...prev, [id]: value }));
  };

  /**
   * Confirms handover using the same server-side check the rider's app uses.
   *
   * The old stub compared nothing and simply announced success. The real
   * check has to happen in a Cloud Function: the delivery code is the only
   * evidence the food reached the person who ordered it, and a check the
   * client performs is a check the client can skip.
   */
  const handleVerifyOtp = async (id) => {
    const code = String(otpInputs[id] || '').trim();
    if (!/^\d{4}$/.test(code)) {
      alert('Enter the 4-digit code the customer gives you.');
      return;
    }
    setBusyId(id);
    try {
      await httpsCallable(getFunctions(), 'verifyDeliveryCode')({
        orderId: id,
        code,
      });
      // No local state change: the snapshot listener above removes the order
      // once its status moves on. One source of truth, not two.
      setOtpInputs(prev => ({ ...prev, [id]: '' }));
    } catch (e) {
      alert(e?.message || 'That code did not match.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 'bold' }}>
        Delivery Dashboard
      </Typography>

      <Grid container spacing={3}>
        <Grid xs={12} md={4}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Assigned Orders{!loading && ` (${assignedOrders.length})`}
          </Typography>

          {loading && (
            <Typography variant="body2" color="text.secondary">Loading live deliveries…</Typography>
          )}
          {!loading && assignedOrders.length === 0 && (
            <Paper sx={{ p: 3, textAlign: 'center', bgcolor: 'grey.50' }}>
              <Typography variant="body2" color="text.secondary">
                No orders are out for delivery right now.
              </Typography>
            </Paper>
          )}

          {assignedOrders.map(order => (
            <Card key={order.id} sx={{ mb: 2, borderLeft: order.status === 'delivered' ? '4px solid green' : '4px solid orange' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="subtitle1" fontWeight="bold">{order.orderId}</Typography>
                  <Chip 
                    label={order.status.replace(/_/g, ' ')} 
                    color={order.status === 'delivered' ? 'success' : 'warning'} 
                    size="small" 
                  />
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                  <Person fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />
                  <Typography variant="body2">{order.customerName}</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                  <Phone fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />
                  <Typography variant="body2">{order.phone}</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2 }}>
                  <Map fontSize="small" sx={{ mr: 1, mt: 0.5, color: 'text.secondary' }} />
                  <Typography variant="body2">{order.address}</Typography>
                </Box>
                <Typography variant="caption" color="text.secondary">
                  Rider: {order.rider}
                </Typography>

                {order.status !== 'delivered' && (
                  <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                    <TextField 
                      size="small" 
                      placeholder="Enter OTP" 
                      value={otpInputs[order.id] || ''}
                      onChange={(e) => handleOtpChange(order.id, e.target.value)}
                      fullWidth
                    />
                    <Button 
                      variant="contained" 
                      color="primary" 
                      onClick={() => handleVerifyOtp(order.id)}
                      disabled={!otpInputs[order.id] || busyId === order.id}
                    >
                      {busyId === order.id ? 'Checking…' : 'Verify'}
                    </Button>
                  </Box>
                )}
              </CardContent>
            </Card>
          ))}
        </Grid>

        <Grid xs={12} md={8}>
          <Typography variant="h6" sx={{ mb: 2 }}>Rider Positions</Typography>
          <LiveDeliveryMap riders={deliveryPartners || []} height={600} />
        </Grid>
      </Grid>
    </Box>
  );
};

export default DeliveryDashboard;
