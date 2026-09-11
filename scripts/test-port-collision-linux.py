import errno
import socket

ITERATIONS = 10
COLLISION_PORT = 34_173
SAFE_PORT = 29_173
TARGET_PORT = 40_000
SOCKET_TIMEOUT_SECONDS = 2
REQUEST = b'q'
RESPONSE = b'r'


def dual_stack_listener(port):
    server = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
    try:
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        server.settimeout(SOCKET_TIMEOUT_SECONDS)
        server.bind(('::', port))
        server.listen(1)
    except BaseException:
        server.close()
        raise
    return server


def ipv4_listener(port):
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server.settimeout(SOCKET_TIMEOUT_SECONDS)
        server.bind(('127.0.0.1', port))
        server.listen(1)
    except BaseException:
        server.close()
        raise
    return server


def close_socket(connection):
    if connection is None:
        return
    try:
        connection.shutdown(socket.SHUT_RDWR)
    except OSError:
        pass
    connection.close()


def round_trip(server_connection, client_connection):
    client_connection.sendall(REQUEST)
    if server_connection.recv(len(REQUEST)) != REQUEST:
        raise AssertionError('server did not receive the diagnostic request')
    server_connection.sendall(RESPONSE)
    if client_connection.recv(len(RESPONSE)) != RESPONSE:
        raise AssertionError('client did not receive the diagnostic response')


collision_failures = 0
safe_successes = 0
observed_source_ports = []

for iteration in range(ITERATIONS):
    target = client = accepted = collision_listener = None
    safe_listener = safe_client = safe_accepted = None
    try:
        target = ipv4_listener(TARGET_PORT + iteration)

        client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        client.settimeout(SOCKET_TIMEOUT_SECONDS)
        client.connect(('127.0.0.1', TARGET_PORT + iteration))
        accepted, _ = target.accept()
        accepted.settimeout(SOCKET_TIMEOUT_SECONDS)
        source_port = client.getsockname()[1]
        observed_source_ports.append(source_port)
        if source_port != COLLISION_PORT:
            raise AssertionError(f'expected source port {COLLISION_PORT}, got {source_port}')
        round_trip(accepted, client)

        try:
            collision_listener = dual_stack_listener(COLLISION_PORT)
        except OSError as error:
            if error.errno != errno.EADDRINUSE:
                raise
            collision_failures += 1
        else:
            close_socket(collision_listener)
            collision_listener = None

        safe_listener = dual_stack_listener(SAFE_PORT)
        safe_client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        safe_client.settimeout(SOCKET_TIMEOUT_SECONDS)
        safe_client.connect(('127.0.0.1', SAFE_PORT))
        safe_accepted, _ = safe_listener.accept()
        safe_accepted.settimeout(SOCKET_TIMEOUT_SECONDS)
        if safe_client.getsockname()[1] != COLLISION_PORT:
            raise AssertionError(f'expected safe source port {COLLISION_PORT}, got {safe_client.getsockname()[1]}')
        round_trip(safe_accepted, safe_client)
        safe_successes += 1
    finally:
        for connection in (
            safe_accepted,
            safe_client,
            safe_listener,
            collision_listener,
            accepted,
            client,
            target,
        ):
            close_socket(connection)

print({
    'iterations': ITERATIONS,
    'collision_failures': collision_failures,
    'safe_successes': safe_successes,
    'observed_source_ports': observed_source_ports,
}, flush=True)
if collision_failures != ITERATIONS or safe_successes != ITERATIONS:
    raise SystemExit('unexpected Linux fixed-port collision counts')
