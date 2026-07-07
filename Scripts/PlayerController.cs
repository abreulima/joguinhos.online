using UnityEngine;
using UnityEngine.InputSystem;

public class PlayerController : MonoBehaviour
{
    public float speed = 5f;
    public float mouseSensitivity = 0.1f;

    public float shootDistance = 100f;
    public float fireRate = 0.2f;
    public int damage = 25;

    public ParticleSystem particle;

    public Camera playerCamera;

    private CharacterController controller;
    private float upDownLook;
    private float nextTimeToShoot;

    public float jumpPower = 8f;
    public float gravity = -20f;

    private float upSpeed;

    public ParticleSystem hitParticle;

    public LayerMask shootLayers;


    void Start()
    {
        controller = GetComponent<CharacterController>();

        if (playerCamera == null)
        {
            playerCamera = Camera.main;
        }

        Cursor.lockState = CursorLockMode.Locked;
        Cursor.visible = false;
    }

    void Update()
    {
        if (Keyboard.current == null || Mouse.current == null)
        {
            return;
        }

        Look();
        Move();
        Shoot();
    }

    void Look()
    {
        Vector2 mouseMove = Mouse.current.delta.ReadValue();

        // Turn the player left and right
        transform.Rotate(0, mouseMove.x * mouseSensitivity, 0);

        // Look up and down with the camera
        upDownLook -= mouseMove.y * mouseSensitivity;
        upDownLook = Mathf.Clamp(upDownLook, -80f, 80f);

        playerCamera.transform.localRotation = Quaternion.Euler(upDownLook, 0, 0);
    }

    void Move()
    {
        Vector3 move = Vector3.zero;

        if (Keyboard.current.wKey.isPressed)
        {
            move += transform.forward;
        }

        if (Keyboard.current.sKey.isPressed)
        {
            move -= transform.forward;
        }

        if (Keyboard.current.aKey.isPressed)
        {
            move -= transform.right;
        }

        if (Keyboard.current.dKey.isPressed)
        {
            move += transform.right;
        }

        move = move.normalized * speed;

        // If the player is on the ground
        if (controller.isGrounded)
        {
            upSpeed = -1f;

            // Press Space to jump
            if (Keyboard.current.spaceKey.wasPressedThisFrame)
            {
                upSpeed = jumpPower;
            }
        }

        // Pull the player down
        upSpeed += gravity * Time.deltaTime;

        // Add jumping/falling to movement
        move.y = upSpeed;

        // Move with collisions
        controller.Move(move * Time.deltaTime);
    }

    void Shoot()
    {
        // Hold left mouse button to keep shooting
        if (Mouse.current.leftButton.isPressed && Time.time >= nextTimeToShoot)
        {

            if (particle != null)
            {
                particle.Play();
            }

            nextTimeToShoot = Time.time + fireRate;

            Ray ray = new Ray(playerCamera.transform.position, playerCamera.transform.forward);

            if (Physics.Raycast(ray, out RaycastHit hit, shootDistance, shootLayers))
            {
                Target target = hit.collider.GetComponent<Target>();

                if (hitParticle != null)
                {
                    ParticleSystem newParticle = Instantiate(hitParticle, hit.point, Quaternion.LookRotation(hit.normal));
                    newParticle.transform.SetParent(hit.collider.transform, true);
                }


                if (target != null)
                {
                    target.TakeDamage(damage);
                }

                if (hit.rigidbody != null)
                {
                    hit.rigidbody.AddForce(ray.direction * 25f, ForceMode.Impulse);
                }

                Debug.Log("Shot: " + hit.collider.name);
            }
        }
    }

}
