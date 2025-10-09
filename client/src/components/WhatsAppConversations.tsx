import React, { useState, useEffect, useRef } from 'react';
import { Send, Phone, MoreVertical, Search, ArrowLeft, Check, CheckCheck, User } from 'lucide-react';

// Mock data para demostración
const mockConversations = [
  {
    id: 1,
    customerName: "Juan Pérez",
    customerPhone: "+1 809-555-0101",
    lastMessage: "Gracias por tu ayuda",
    lastMessageAt: new Date(Date.now() - 1000 * 60 * 5),
    unreadCount: 0,
    status: "active"
  },
  {
    id: 2,
    customerName: "María González",
    customerPhone: "+1 809-555-0102",
    lastMessage: "¿Cuándo llega mi pedido?",
    lastMessageAt: new Date(Date.now() - 1000 * 60 * 30),
    unreadCount: 2,
    status: "active"
  },
  {
    id: 3,
    customerName: "Carlos Rodríguez",
    customerPhone: "+1 809-555-0103",
    lastMessage: "Perfecto, muchas gracias",
    lastMessageAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
    unreadCount: 0,
    status: "active"
  },
  {
    id: 4,
    customerName: "Ana Martínez",
    customerPhone: "+1 809-555-0104",
    lastMessage: "Me interesa el producto",
    lastMessageAt: new Date(Date.now() - 1000 * 60 * 60 * 5),
    unreadCount: 1,
    status: "active"
  }
];

const mockMessages = {
  1: [
    {
      id: 1,
      content: "Hola, necesito ayuda con mi pedido",
      senderType: "customer",
      sentAt: new Date(Date.now() - 1000 * 60 * 15),
      status: "read"
    },
    {
      id: 2,
      content: "¡Hola! Claro, con gusto te ayudo. ¿Cuál es tu número de pedido?",
      senderType: "agent",
      sentAt: new Date(Date.now() - 1000 * 60 * 12),
      status: "read"
    },
    {
      id: 3,
      content: "Es el #12345",
      senderType: "customer",
      sentAt: new Date(Date.now() - 1000 * 60 * 10),
      status: "read"
    },
    {
      id: 4,
      content: "Perfecto, ya veo tu pedido. Está en camino y debería llegar mañana entre 2-5 PM",
      senderType: "agent",
      sentAt: new Date(Date.now() - 1000 * 60 * 8),
      status: "read"
    },
    {
      id: 5,
      content: "Gracias por tu ayuda",
      senderType: "customer",
      sentAt: new Date(Date.now() - 1000 * 60 * 5),
      status: "read"
    }
  ],
  2: [
    {
      id: 6,
      content: "¿Cuándo llega mi pedido?",
      senderType: "customer",
      sentAt: new Date(Date.now() - 1000 * 60 * 30),
      status: "delivered"
    }
  ]
};

function WhatsAppConversations() {
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (selectedConversation) {
      setMessages(mockMessages[selectedConversation.id] || []);
    }
  }, [selectedConversation]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    
    if (hours < 24) {
      return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    } else if (hours < 48) {
      return 'Ayer';
    } else {
      return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
    }
  };

  const handleSendMessage = () => {
    if (!newMessage.trim() || !selectedConversation) return;

    const newMsg = {
      id: Date.now(),
      content: newMessage,
      senderType: "agent",
      sentAt: new Date(),
      status: "sent"
    };

    setMessages([...messages, newMsg]);
    setNewMessage("");
  };

  const filteredConversations = mockConversations.filter(conv =>
    conv.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    conv.customerPhone.includes(searchTerm)
  );

  const MessageStatus = ({ status }) => {
    if (status === 'read') {
      return <CheckCheck className="w-4 h-4 text-blue-400" />;
    } else if (status === 'delivered') {
      return <CheckCheck className="w-4 h-4 text-gray-400" />;
    } else {
      return <Check className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* Panel de conversaciones */}
      <div className={`${selectedConversation ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-96 bg-white border-r border-gray-200`}>
        {/* Header de conversaciones */}
        <div className="flex-shrink-0 bg-emerald-600 p-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-white text-xl font-semibold">Conversaciones</h1>
            <button className="text-white hover:bg-emerald-700 p-2 rounded-full transition-colors">
              <MoreVertical className="w-5 h-5" />
            </button>
          </div>
          
          {/* Buscador */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Buscar conversación..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-white border-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Lista de conversaciones con scroll */}
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.map((conversation) => (
            <div
              key={conversation.id}
              onClick={() => setSelectedConversation(conversation)}
              className={`flex items-center p-4 cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-100 ${
                selectedConversation?.id === conversation.id ? 'bg-emerald-50' : ''
              }`}
            >
              {/* Avatar */}
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center text-white font-semibold mr-3">
                <User className="w-6 h-6" />
              </div>

              {/* Información de la conversación */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-gray-900 truncate">
                    {conversation.customerName}
                  </h3>
                  <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                    {formatTime(conversation.lastMessageAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-600 truncate">
                    {conversation.lastMessage}
                  </p>
                  {conversation.unreadCount > 0 && (
                    <span className="ml-2 flex-shrink-0 bg-emerald-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                      {conversation.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Panel de chat */}
      {selectedConversation ? (
        <div className="flex flex-col flex-1 bg-gray-50">
          {/* Header del chat - FIJO */}
          <div className="flex-shrink-0 bg-emerald-600 px-4 py-3 flex items-center justify-between shadow-md">
            <div className="flex items-center flex-1">
              <button
                onClick={() => setSelectedConversation(null)}
                className="md:hidden mr-3 text-white hover:bg-emerald-700 p-2 rounded-full transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white mr-3">
                <User className="w-5 h-5" />
              </div>
              
              <div className="flex-1 min-w-0">
                <h2 className="text-white font-semibold truncate">
                  {selectedConversation.customerName}
                </h2>
                <p className="text-emerald-100 text-sm truncate">
                  {selectedConversation.customerPhone}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button className="text-white hover:bg-emerald-700 p-2 rounded-full transition-colors">
                <Phone className="w-5 h-5" />
              </button>
              <button className="text-white hover:bg-emerald-700 p-2 rounded-full transition-colors">
                <MoreVertical className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Área de mensajes con scroll */}
          <div 
            className="flex-1 overflow-y-auto p-4 space-y-3"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
              backgroundColor: '#efeae2'
            }}
          >
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.senderType === 'agent' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] px-4 py-2 rounded-lg shadow-sm ${
                    message.senderType === 'agent'
                      ? 'bg-emerald-500 text-white rounded-br-none'
                      : 'bg-white text-gray-900 rounded-bl-none'
                  }`}
                >
                  <p className="text-sm break-words">{message.content}</p>
                  <div className={`flex items-center justify-end space-x-1 mt-1 ${
                    message.senderType === 'agent' ? 'text-emerald-100' : 'text-gray-500'
                  }`}>
                    <span className="text-xs">
                      {formatTime(message.sentAt)}
                    </span>
                    {message.senderType === 'agent' && (
                      <MessageStatus status={message.status} />
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input de mensaje - FIJO */}
          <div className="flex-shrink-0 bg-white border-t border-gray-200 p-4">
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Escribe un mensaje..."
                className="flex-1 px-4 py-3 rounded-full bg-gray-100 border-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                onClick={handleSendMessage}
                disabled={!newMessage.trim()}
                className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white p-3 rounded-full transition-colors shadow-lg"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <User className="w-10 h-10 text-emerald-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-700 mb-2">
              Selecciona una conversación
            </h3>
            <p className="text-gray-500">
              Elige un chat de la lista para comenzar a conversar
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default WhatsAppConversations;