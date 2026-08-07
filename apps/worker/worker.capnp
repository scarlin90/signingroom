using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
    services = [
        (
            name = "main", 
            worker = .worker
        ),
    ],
    sockets = [
        (
            service = "main", 
            name = "http", 
            address = "*:8787", 
            http = ()
        ),
    ]
);

const worker :Workerd.Worker = (
    modules = [
        (name = "worker", esModule = embed "index.js"),
    ],
    compatibilityDate = "2024-04-01",
    compatibilityFlags = ["nodejs_compat"],
    
    # Enable volatile in-memory storage for local execution
    durableObjectStorage = (inMemory = void),

    # Declare the Durable Object namespace class and unique key
    durableObjectNamespaces = [
        (className = "SigningRoom", uniqueKey = "signing-room-ns")
    ],

    # Point the binding name to the className/namespace reference
    bindings = [
        (name = "SIGNING_ROOM", durableObjectNamespace = "SigningRoom"),
        (name = "ENVIRONMENT", fromEnvironment = "ENVIRONMENT"),
        (name = "ALLOWED_ORIGIN", fromEnvironment = "ALLOWED_ORIGIN"),
        (name = "API_PUBLIC_URL", fromEnvironment = "API_PUBLIC_URL"),
    ],
);