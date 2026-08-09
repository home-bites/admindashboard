import React, { useState } from 'react';
import { 
  Box, Typography, Tabs, Tab, Paper, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, Chip, Button, Grid, Card, CardContent 
} from '@mui/material';
import { 
  Assessment, People, LocalShipping, Receipt, History, Update, 
  CalendarMonth, RestaurantMenu 
} from '@mui/icons-material';

const Subscriptions = () => {
  const [tabValue, setTabValue] = useState(0);

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const renderDashboardCards = () => (
    <Grid container spacing={3} sx={{ mb: 3 }}>
      <Grid item xs={12} sm={6} md={3}>
        <Card sx={{ bgcolor: '#e3f2fd' }}>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>Active Plans</Typography>
            <Typography variant="h4">124</Typography>
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <Card sx={{ bgcolor: '#e8f5e9' }}>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>Today's Deliveries</Typography>
            <Typography variant="h4">48</Typography>
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <Card sx={{ bgcolor: '#fff3e0' }}>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>Pending Renewals</Typography>
            <Typography variant="h4">12</Typography>
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <Card sx={{ bgcolor: '#fce4ec' }}>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>Monthly Revenue</Typography>
            <Typography variant="h4">₹45K</Typography>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );

  const renderTablePlaceholder = (title, columns) => (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6">{title}</Typography>
        <Button variant="contained" color="primary">Add New</Button>
      </Box>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              {columns.map((col, idx) => <TableCell key={idx}><b>{col}</b></TableCell>)}
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              <TableCell colSpan={columns.length} align="center">
                <Typography variant="body2" color="textSecondary" sx={{ py: 3 }}>
                  No data available yet.
                </Typography>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );

  const [plans, setPlans] = useState([
    { id: 'PLN-1', name: 'Monthly Basic', type: 'Regular', duration: '30 Days', price: 3000, available: true },
    { id: 'PLN-2', name: 'Keto Diet Weekly', type: 'Diet', duration: '7 Days', price: 1500, available: true }
  ]);
  const [newPlan, setNewPlan] = useState({ name: '', type: 'Regular', duration: '', price: '', available: true });
  const [showAddPlan, setShowAddPlan] = useState(false);

  const handleAddPlan = () => {
    const id = `PLN-${plans.length + 1}`;
    setPlans([...plans, { ...newPlan, id, price: Number(newPlan.price) }]);
    setShowAddPlan(false);
    setNewPlan({ name: '', type: 'Regular', duration: '', price: '', available: true });
  };

  const renderPlansTab = () => (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6">Subscription Plans</Typography>
        <Button variant="contained" color="primary" onClick={() => setShowAddPlan(!showAddPlan)}>
          {showAddPlan ? 'Cancel' : 'Add New Plan'}
        </Button>
      </Box>

      {showAddPlan && (
        <Card sx={{ mb: 3, p: 2 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Create New Plan</Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={3}>
              <Box component="input" placeholder="Plan Name" value={newPlan.name} onChange={e => setNewPlan({...newPlan, name: e.target.value})} className="w-full p-2 border rounded" />
            </Grid>
            <Grid item xs={12} sm={2}>
              <select value={newPlan.type} onChange={e => setNewPlan({...newPlan, type: e.target.value})} className="w-full p-2 border rounded">
                <option value="Regular">Regular</option>
                <option value="Diet">Diet</option>
              </select>
            </Grid>
            <Grid item xs={12} sm={3}>
              <Box component="input" placeholder="Duration (e.g. 30 Days)" value={newPlan.duration} onChange={e => setNewPlan({...newPlan, duration: e.target.value})} className="w-full p-2 border rounded" />
            </Grid>
            <Grid item xs={12} sm={2}>
              <Box component="input" type="number" placeholder="Price (₹)" value={newPlan.price} onChange={e => setNewPlan({...newPlan, price: e.target.value})} className="w-full p-2 border rounded" />
            </Grid>
            <Grid item xs={12} sm={2} sx={{ display: 'flex', alignItems: 'center' }}>
              <Button variant="contained" color="success" fullWidth onClick={handleAddPlan}>Save</Button>
            </Grid>
          </Grid>
        </Card>
      )}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell><b>Plan ID</b></TableCell>
              <TableCell><b>Name</b></TableCell>
              <TableCell><b>Type</b></TableCell>
              <TableCell><b>Duration</b></TableCell>
              <TableCell><b>Price</b></TableCell>
              <TableCell><b>Availability</b></TableCell>
              <TableCell><b>Actions</b></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {plans.map(plan => (
              <TableRow key={plan.id}>
                <TableCell>{plan.id}</TableCell>
                <TableCell>{plan.name}</TableCell>
                <TableCell>
                  <Chip label={plan.type} color={plan.type === 'Diet' ? 'secondary' : 'default'} size="small" />
                </TableCell>
                <TableCell>{plan.duration}</TableCell>
                <TableCell>₹{plan.price}</TableCell>
                <TableCell>
                  <Chip label={plan.available ? 'Active' : 'Inactive'} color={plan.available ? 'success' : 'error'} size="small" />
                </TableCell>
                <TableCell>
                  <Button size="small" color="primary">Edit</Button>
                  <Button size="small" color="error" sx={{ ml: 1 }}>Delete</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 'bold' }}>
        Subscriptions Management
      </Typography>
      
      {renderDashboardCards()}
      
      <Paper sx={{ width: '100%', mb: 2 }}>
        <Tabs 
          value={tabValue} 
          onChange={handleTabChange} 
          indicatorColor="primary" 
          textColor="primary" 
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab icon={<RestaurantMenu />} label="Plans (Regular/Diet)" iconPosition="start" />
          <Tab icon={<People />} label="Customers" iconPosition="start" />
          <Tab icon={<CalendarMonth />} label="Orders" iconPosition="start" />
          <Tab icon={<LocalShipping />} label="Deliveries" iconPosition="start" />
          <Tab icon={<Update />} label="Renewals" iconPosition="start" />
          <Tab icon={<Receipt />} label="Invoices" iconPosition="start" />
          <Tab icon={<History />} label="History" iconPosition="start" />
          <Tab icon={<Assessment />} label="Analytics" iconPosition="start" />
        </Tabs>
      </Paper>

      <Box sx={{ p: 1 }}>
        {tabValue === 0 && renderPlansTab()}
        {tabValue === 1 && renderTablePlaceholder("Active Customers", ["Customer ID", "Name", "Phone", "Active Plan", "Start Date", "End Date", "Actions"])}
        {tabValue === 2 && renderTablePlaceholder("Orders / Meal Schedule", ["Order ID", "Customer", "Date", "Meal Type", "Status", "Actions"])}
        {tabValue === 3 && renderTablePlaceholder("Deliveries", ["Delivery ID", "Date", "Customer", "Address", "Status", "Driver", "Actions"])}
        {tabValue === 4 && renderTablePlaceholder("Renewals", ["Renewal ID", "Customer", "Plan", "Due Date", "Payment Status", "Actions"])}
        {tabValue === 5 && renderTablePlaceholder("Invoices", ["Invoice No.", "Date", "Customer", "Amount", "Status", "Actions"])}
        {tabValue === 6 && renderTablePlaceholder("Subscription History", ["Record ID", "Customer", "Plan", "Start Date", "End Date", "Status"])}
        {tabValue === 7 && (
          <Box>
            <Typography variant="h6" sx={{ mb: 2 }}>Analytics Overview</Typography>
            <Paper sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="body1" color="textSecondary">
                Charts and graphs for subscription trends, churn rate, and revenue will be displayed here.
              </Typography>
            </Paper>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default Subscriptions;
