import React, { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import ACTIONS from '../Actions';
import Client from '../components/Client';
import Editor from '../components/Editor';
import { initSocket } from '../socket';
import {
    useLocation,
    useNavigate,
    Navigate,
    useParams,
} from 'react-router-dom';

// Updated Chat component that receives messages as props
const Chat = ({ socketRef, roomId, username, messages, setMessages }) => {
    const [messageInput, setMessageInput] = useState('');
    const chatContainerRef = useRef(null);

    // Auto scroll to bottom when new messages arrive
    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [messages]);

    const sendMessage = (e) => {
        e.preventDefault();
        if (messageInput.trim() === '') return;

        // Send message to server
        socketRef.current.emit(ACTIONS.SEND_MESSAGE, {
            roomId,
            message: messageInput.trim()
        });

        setMessageInput('');
    };

    return (
        <div className="chatContainer">
            <div className="chatHeader">
                <h3>Chat</h3>
            </div>
            <div className="chatMessages" ref={chatContainerRef}>
                {messages.length === 0 ? (
                    <div className="emptyChat">No messages yet</div>
                ) : (
                    messages.map((msg, index) => (
                        <div 
                            key={index} 
                            className={`message ${msg.self ? 'self' : 'other'}`}
                        >
                            <div className="messageInfo">
                                <span className="messageSender">{msg.self ? 'You' : msg.sender}</span>
                                <span className="messageTime">{msg.time}</span>
                            </div>
                            <div className="messageContent">{msg.content}</div>
                        </div>
                    ))
                )}
            </div>
            <form className="chatInputContainer" onSubmit={sendMessage}>
                <input
                    type="text"
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    placeholder="Type a message..."
                    className="chatInput"
                />
                <button type="submit" className="sendButton">Send</button>
            </form>
        </div>
    );
};

const EditorPage = () => {
    const socketRef = useRef(null);
    const codeRef = useRef(null);
    const location = useLocation();
    const { roomId } = useParams();
    const reactNavigator = useNavigate();
    const [clients, setClients] = useState([]);
    const [showChat, setShowChat] = useState(false);
    
    // Add state for messages here in EditorPage
    const [messages, setMessages] = useState([]);

    useEffect(() => {
        const init = async () => {
            socketRef.current = await initSocket();
            socketRef.current.on('connect_error', (err) => handleErrors(err));
            socketRef.current.on('connect_failed', (err) => handleErrors(err));

            function handleErrors(e) {
                console.log('socket error', e);
                toast.error('Socket connection failed, try again later.');
                reactNavigator('/');
            }

            socketRef.current.emit(ACTIONS.JOIN, {
                roomId,
                username: location.state?.username,
            });

            // Listening for joined event
            socketRef.current.on(
                ACTIONS.JOINED,
                ({ clients, username, socketId }) => {
                    if (username !== location.state?.username) {
                        toast.success(`${username} joined the room.`);
                        console.log(`${username} joined`);
                    }
                    setClients(clients);
                    socketRef.current.emit(ACTIONS.SYNC_CODE, {
                        code: codeRef.current,
                        socketId,
                    });
                }
            );

            // Listening for disconnected
            socketRef.current.on(
                ACTIONS.DISCONNECTED,
                ({ socketId, username }) => {
                    toast.success(`${username} left the room.`);
                    setClients((prev) => {
                        return prev.filter(
                            (client) => client.socketId !== socketId
                        );
                    });
                }
            );
            
            // Add chat message handlers here
            // Listen for chat history when joining a room
            socketRef.current.on(ACTIONS.CHAT_HISTORY, ({ messages: historyMessages }) => {
                if (historyMessages && Array.isArray(historyMessages)) {
                    // Format the history messages
                    const formattedMessages = historyMessages.map(msg => ({
                        content: msg.content,
                        sender: msg.sender,
                        time: new Date(msg.timestamp).toLocaleTimeString([], { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                        }),
                        self: msg.senderId === socketRef.current.id
                    }));
                    
                    setMessages(formattedMessages);
                }
            });

            // Listen for new messages
            socketRef.current.on(ACTIONS.RECEIVE_MESSAGE, (msg) => {
                const formattedMessage = {
                    content: msg.content,
                    sender: msg.sender,
                    time: new Date(msg.timestamp).toLocaleTimeString([], { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                    }),
                    self: msg.senderId === socketRef.current.id
                };
                
                setMessages((prev) => [...prev, formattedMessage]);
            });
        };
        init();
        return () => {
            socketRef.current.disconnect();
            socketRef.current.off(ACTIONS.JOINED);
            socketRef.current.off(ACTIONS.DISCONNECTED);
            socketRef.current.off(ACTIONS.RECEIVE_MESSAGE);
            socketRef.current.off(ACTIONS.CHAT_HISTORY);
        };
    }, []);

    async function copyRoomId() {
        try {
            await navigator.clipboard.writeText(roomId);
            toast.success('Room ID has been copied to your clipboard');
        } catch (err) {
            toast.error('Could not copy the Room ID');
            console.error(err);
        }
    }

    function leaveRoom() {
        reactNavigator('/');
    }

    function toggleChat() {
        setShowChat(!showChat);
    }

    if (!location.state) {
        return <Navigate to="/" />;
    }

    return (
        <div className="mainWrap">
            <div className="aside">
                <div className="asideInner">
                    <div className="logo">
                        <h3>Code Collab</h3>
                    </div>
                    <div className="roomInfo">
                        <h4>Room: {roomId}</h4>
                    </div>
                    <h3>Connected</h3>
                    <div className="clientsList">
                        {clients.map((client) => (
                            <Client
                                key={client.socketId}
                                username={client.username}
                            />
                        ))}
                    </div>
                </div>
                <div className="asideButtons">
                    <button className="btn primaryBtn" onClick={copyRoomId}>
                        Copy Room ID
                    </button>
                    <button className="btn secondaryBtn" onClick={toggleChat}>
                        {showChat ? 'Hide Chat' : 'Show Chat'}
                    </button>
                    <button className="btn leaveBtn" onClick={leaveRoom}>
                        Leave
                    </button>
                </div>
            </div>
            
            <div className={`editorWrap ${showChat ? 'withChat' : ''}`}>
                <Editor
                    socketRef={socketRef}
                    roomId={roomId}
                    onCodeChange={(code) => {
                        codeRef.current = code;
                    }}
                />
            </div>
            
            {showChat && (
                <div className="chatWrap">
                    <Chat 
                        socketRef={socketRef}
                        roomId={roomId}
                        username={location.state?.username}
                        messages={messages}
                        setMessages={setMessages}
                    />
                </div>
            )}
        </div>
    );
};

export default EditorPage;