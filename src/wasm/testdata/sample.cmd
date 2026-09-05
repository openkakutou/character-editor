; Sample .cmd fixture used by cmd.Parse tests.

;====================<BUTTON REMAPPING>====================

[Remap]
a = a
b = b
x = y

;====================<DEFAULT VALUES>====================

[Defaults]
command.time = 15
command.buffer.time = 1

;====================<SINGLE BUTTON>====================

[Command]
name = "a"
command = a
time = 1

[Command]
name = "QCF_a"
command = ~D, DF, F, a

;====================<ALWAYS>====================

[Statedef -1]

[State -1, HoldBack Detect]
type = VarSet
trigger1 = 1
value = 1

[State -1, QCF Special]
type = ChangeState
value = 1000
trigger1 = command = "QCF_a"
trigger1 = statetype != A
