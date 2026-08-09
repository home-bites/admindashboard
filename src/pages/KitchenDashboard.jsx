import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import * as LoadingComponents from "../components/LoadingComponents";

const KitchenDashboard = () => {
  const [tabValue, setTabValue] = useState(0);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const q = query(
      collection(db, 'kitchenQueue'),
      where('createdAt', '>=', today),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData = [];
      snapshot.forEach((doc) => {
        ordersData.push({ id: doc.id, ...doc.data() });
      });
      setOrders(ordersData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching kitchen queue:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const todaysOrders = orders.filter(o => o.type !== 'subscription');
  const subMeals = orders.filter(o => o.type === 'subscription');
  const prepQueue = orders.filter(o => o.status === 'preparing');
  const readyQueue = orders.filter(o => o.status === 'ready');

  const tabs = [
    { label: `Today's Orders (${todaysOrders.length})`, data: todaysOrders },
    { label: `Subscription Orders (${subMeals.length})`, data: subMeals },
    { label: `Cooking Queue (${prepQueue.length})`, data: prepQueue },
    { label: `Ready Queue (${readyQueue.length})`, data: readyQueue }
  ];

  const groupOrdersBySlot = (orderList) => {
    const grouped = { Breakfast: [], Lunch: [], Dinner: [], Other: [] };
    orderList.forEach(order => {
      const slot = order.deliverySlot || 'Other';
      if (grouped[slot]) {
        grouped[slot].push(order);
      } else {
        grouped.Other.push(order);
      }
    });
    return grouped;
  };

  const renderOrderList = (orderList) => {
    if (orderList.length === 0) return <p className="text-gray-500">No orders found for this slot.</p>;
    
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {orderList.map((order) => (
          <div key={order.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-800">Order #{order.id.slice(-6)}</h3>
              <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold mt-2 mb-4">
                {order.status}
              </span>
              <p className="text-sm text-gray-600 mb-2">Items: {order.items?.length || 0}</p>
              <p className="text-sm text-gray-500">
                Placed: {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleTimeString() : new Date(order.createdAt).toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderOrders = (orderList) => {
    if (loading) return <LoadingComponents.LoadingPage />;
    if (orderList.length === 0) return <p className="text-gray-500">No orders found.</p>;

    const grouped = groupOrdersBySlot(orderList);

    return (
      <div className="space-y-8">
        {Object.keys(grouped).map(slot => (
          grouped[slot].length > 0 && (
            <div key={slot}>
              <h3 className="text-xl font-semibold mb-4 text-gray-700 border-b pb-2">{slot}</h3>
              {renderOrderList(grouped[slot])}
            </div>
          )
        ))}
      </div>
    );
  };

  return (
    <div className="p-8 min-h-screen bg-[#f9f9ff]">
      <h2 className="text-3xl font-bold text-gray-900 mb-6">Kitchen Display System (KDS)</h2>
      
      <div className="flex space-x-4 mb-8 overflow-x-auto pb-2 border-b border-gray-200">
        {tabs.map((tab, idx) => (
          <button
            key={idx}
            className={`px-4 py-2 text-sm font-semibold whitespace-nowrap rounded-lg transition-colors ${
              tabValue === idx ? 'bg-primary-500 text-white shadow-md' : 'text-gray-600 hover:bg-gray-100'
            }`}
            onClick={() => setTabValue(idx)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {renderOrders(tabs[tabValue].data)}
      </div>
    </div>
  );
};

export default KitchenDashboard;
