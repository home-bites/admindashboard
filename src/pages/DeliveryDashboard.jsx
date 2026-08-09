import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Grid, Card, CardContent, Chip, Button, TextField } from '@mui/material';
import { Map, Person, Phone, VpnKey, CheckCircle } from '@mui/icons-material';

const DeliveryDashboard = () => {
  const [assignedOrders, setAssignedOrders] = useState([
    { id: 'ORD-1001', customerName: 'John Doe', phone: '+1234567890', address: '123 Main St, Apt 4B', status: 'out_for_delivery' },
    { id: 'ORD-1002', customerName: 'Jane Smith', phone: '+0987654321', address: '456 Oak Ave', status: 'assigned' }
  ]);
  const [otpInputs, setOtpInputs] = useState({});

  const handleOtpChange = (id, value) => {
    setOtpInputs(prev => ({ ...prev, [id]: value }));
  };

  const handleVerifyOtp = (id) => {
    // Stub verification
    alert(`Verified OTP for ${id}`);
    setAssignedOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'delivered' } : o));
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 'bold' }}>
        Delivery Dashboard
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Typography variant="h6" sx={{ mb: 2 }}>Assigned Orders</Typography>
          {assignedOrders.map(order => (
            <Card key={order.id} sx={{ mb: 2, borderLeft: order.status === 'delivered' ? '4px solid green' : '4px solid orange' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="subtitle1" fontWeight="bold">{order.id}</Typography>
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
                      disabled={!otpInputs[order.id]}
                    >
                      Verify
                    </Button>
                  </Box>
                )}
              </CardContent>
            </Card>
          ))}
        </Grid>

        <Grid item xs={12} md={8}>
          <Typography variant="h6" sx={{ mb: 2 }}>Map Route</Typography>
          <Paper sx={{ height: '600px', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#e0e0e0', borderRadius: 2 }}>
            <Box sx={{ textAlign: 'center' }}>
              <Map sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h6" color="text.secondary">Live Map Stub</Typography>
              <Typography variant="body2" color="text.secondary">Integration with Google Maps would appear here.</Typography>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default DeliveryDashboard;
