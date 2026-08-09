import React, { useState } from 'react';
import { Box, Typography, Paper, Tabs, Tab, Grid, Card, CardContent, Avatar, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import { AccountCircle, ShoppingBag, CardMembership, Payment, AccountBalanceWallet, LocalOffer, Star, SupportAgent } from '@mui/icons-material';

const CustomerDetails = () => {
  const [tabValue, setTabValue] = useState(0);

  const customer = {
    name: 'Jane Doe',
    email: 'jane.doe@example.com',
    phone: '+1 987 654 3210',
    joined: 'Jan 15, 2026',
    status: 'Active',
    walletBalance: 1250,
    loyaltyPoints: 450
  };

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const renderTable = (columns, data) => (
    <TableContainer component={Paper} sx={{ mt: 2 }}>
      <Table>
        <TableHead>
          <TableRow>
            {columns.map((col, idx) => <TableCell key={idx}><b>{col}</b></TableCell>)}
          </TableRow>
        </TableHead>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} align="center" sx={{ py: 3 }}>
                No records found.
              </TableCell>
            </TableRow>
          ) : (
             <TableRow>
               <TableCell colSpan={columns.length} align="center">Data rendering placeholder</TableCell>
             </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 'bold' }}>
        Customer 360 View
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={3} alignItems="center">
          <Grid item>
            <Avatar sx={{ width: 80, height: 80, bgcolor: 'primary.main' }}>
              <AccountCircle fontSize="large" />
            </Avatar>
          </Grid>
          <Grid item xs>
            <Typography variant="h5" fontWeight="bold">{customer.name}</Typography>
            <Typography variant="body1" color="text.secondary">{customer.email} | {customer.phone}</Typography>
            <Typography variant="body2" color="text.secondary">Joined: {customer.joined}</Typography>
          </Grid>
          <Grid item>
            <Box sx={{ textAlign: 'right' }}>
              <Chip label={customer.status} color="success" sx={{ mb: 1 }} />
              <Typography variant="h6">Wallet: ₹{customer.walletBalance}</Typography>
              <Typography variant="body2" color="text.secondary">Loyalty Points: {customer.loyaltyPoints}</Typography>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ width: '100%', mb: 2 }}>
        <Tabs 
          value={tabValue} 
          onChange={handleTabChange} 
          indicatorColor="primary" 
          textColor="primary" 
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab icon={<ShoppingBag />} label="Orders" iconPosition="start" />
          <Tab icon={<CardMembership />} label="Subscriptions" iconPosition="start" />
          <Tab icon={<Payment />} label="Payments" iconPosition="start" />
          <Tab icon={<AccountBalanceWallet />} label="Wallet History" iconPosition="start" />
          <Tab icon={<LocalOffer />} label="Coupons" iconPosition="start" />
          <Tab icon={<Star />} label="Reviews" iconPosition="start" />
          <Tab icon={<SupportAgent />} label="Tickets" iconPosition="start" />
        </Tabs>
      </Paper>

      <Box sx={{ p: 1 }}>
        {tabValue === 0 && renderTable(['Order ID', 'Date', 'Amount', 'Status', 'Items'], [])}
        {tabValue === 1 && renderTable(['Plan ID', 'Plan Name', 'Start Date', 'End Date', 'Status'], [])}
        {tabValue === 2 && renderTable(['Txn ID', 'Date', 'Amount', 'Method', 'Status'], [])}
        {tabValue === 3 && renderTable(['Txn ID', 'Date', 'Type (Cr/Dr)', 'Amount', 'Balance', 'Description'], [])}
        {tabValue === 4 && renderTable(['Coupon Code', 'Discount', 'Used Date', 'Order ID'], [])}
        {tabValue === 5 && renderTable(['Review ID', 'Date', 'Rating', 'Comment', 'Order ID'], [])}
        {tabValue === 6 && renderTable(['Ticket ID', 'Date', 'Subject', 'Status', 'Resolution'], [])}
      </Box>
    </Box>
  );
};

export default CustomerDetails;
